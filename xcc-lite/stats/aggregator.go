// stats 包实现 5 分钟聚合统计（SQLite 持久化）与入口中间件采集，
// 提供报表查询接口。后续可扩展 30 秒滑窗用于人机验证。
package stats

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// Aggregator 维护内存中的当前 5 分钟桶累加，并定期批量写入 SQLite。
type Aggregator struct {
	db     *sql.DB
	shards []aggShard
	dmu    sync.RWMutex
	dom    map[string]struct{}
}

type aggShard struct {
	mu sync.Mutex
	tr map[bucketKey]*traffic
}

// bucketKey 为域名 + 时间桶的键。
type bucketKey struct {
	domain string
	ts     int64
}

// ipKey 为域名 + IP + 时间桶的键，用于计数请求数。

// traffic 为单桶聚合的各项指标。
type traffic struct {
	req      int64
	bytesIn  int64
	bytesOut int64
	cacheHit int64
	s2xx     int64
	s3xx     int64
	s4xx     int64
	s5xx     int64
}

// New 初始化统计器与 SQLite 表，开启后台刷写与清理循环。
func New(dbPath string) (*Aggregator, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}
	_, _ = db.Exec(`PRAGMA journal_mode=WAL;`)
	_, _ = db.Exec(`PRAGMA synchronous=NORMAL;`)
	_, _ = db.Exec(`PRAGMA busy_timeout=3000;`)
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS traffic_5m (domain TEXT, ts INTEGER, fmt_time TEXT, req_count INTEGER, bytes_in INTEGER, bytes_out INTEGER, cache_hit_count INTEGER, status_2xx INTEGER, status_3xx INTEGER, status_4xx INTEGER, status_5xx INTEGER, PRIMARY KEY(domain, ts))`); err != nil {
		return nil, err
	}
	a := &Aggregator{db: db, shards: make([]aggShard, 16), dom: make(map[string]struct{})}
	for i := range a.shards {
		a.shards[i].tr = make(map[bucketKey]*traffic)
	}
	go a.loop()
	return a, nil
}

// loop 周期性执行刷写与过期数据清理任务。
func (a *Aggregator) loop() {
	flushTicker := time.NewTicker(10 * time.Second)
	cleanTicker := time.NewTicker(1 * time.Hour)
	for {
		select {
		case <-flushTicker.C:
			a.flush()
		case <-cleanTicker.C:
			a.cleanup()
		}
	}
}

// bucketStart 计算 5 分钟对齐的时间桶起始秒。
func bucketStart(t time.Time) int64 {
	u := t.Unix()
	return u - (u % 300)
}

func formatBucket(ts int64) string {
	return time.Unix(ts, 0).Format("2006-01-02 15:04")
}

func (a *Aggregator) shardFor(domain string, ts int64) *aggShard {
	var h uint32 = uint32(ts)
	for i := 0; i < len(domain); i++ {
		h = h*16777619 ^ uint32(domain[i])
	}
	return &a.shards[int(h%uint32(len(a.shards)))]
}

// Observe 记录一次请求的统计信息到当前时间桶。
func (a *Aggregator) Observe(domain string, status int, cacheHit bool, bytesOut, bytesIn int64) {
	ts := bucketStart(time.Now())
	sh := a.shardFor(domain, ts)
	sh.mu.Lock()
	bk := bucketKey{domain: domain, ts: ts}
	v := sh.tr[bk]
	if v == nil {
		v = &traffic{}
		sh.tr[bk] = v
	}
	v.req++
	v.bytesOut += bytesOut
	v.bytesIn += bytesIn
	if cacheHit {
		v.cacheHit++
	}
	switch {
	case status >= 200 && status < 300:
		v.s2xx++
	case status >= 300 && status < 400:
		v.s3xx++
	case status >= 400 && status < 500:
		v.s4xx++
	case status >= 500 && status < 600:
		v.s5xx++
	}
	sh.mu.Unlock()
}

// flush 将内存累加的增量批量写入 SQLite，并重置内存缓冲。
func (a *Aggregator) flush() {
	var total int
	shardsData := make([]map[bucketKey]*traffic, len(a.shards))
	for i := range a.shards {
		s := &a.shards[i]
		s.mu.Lock()
		tr := s.tr
		if len(tr) > 0 {
			shardsData[i] = tr
			total += len(tr)
			s.tr = make(map[bucketKey]*traffic)
		} else {
			shardsData[i] = nil
		}
		s.mu.Unlock()
	}
	if total == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return
	}
	for i := range shardsData {
		tr := shardsData[i]
		if tr == nil {
			continue
		}
		for k, v := range tr {
			_, _ = tx.ExecContext(ctx, `INSERT INTO traffic_5m (domain, ts, fmt_time, req_count, bytes_in, bytes_out, cache_hit_count, status_2xx, status_3xx, status_4xx, status_5xx)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(domain, ts) DO UPDATE SET
                req_count = req_count + excluded.req_count,
                bytes_in = bytes_in + excluded.bytes_in,
                bytes_out = bytes_out + excluded.bytes_out,
                cache_hit_count = cache_hit_count + excluded.cache_hit_count,
                status_2xx = status_2xx + excluded.status_2xx,
                status_3xx = status_3xx + excluded.status_3xx,
                status_4xx = status_4xx + excluded.status_4xx,
                status_5xx = status_5xx + excluded.status_5xx`,
				k.domain, k.ts, formatBucket(k.ts), v.req, v.bytesIn, v.bytesOut, v.cacheHit, v.s2xx, v.s3xx, v.s4xx, v.s5xx)
		}
	}
	_ = tx.Commit()
}

// cleanup 删除超过 7 天的历史数据。
func (a *Aggregator) cleanup() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cutoff := time.Now().Add(-7 * 24 * time.Hour).Unix()
	_, _ = a.db.ExecContext(ctx, `DELETE FROM traffic_5m WHERE ts < ?`, cutoff)
}

// Row 表示查询返回的 5 分钟聚合数据行。
type Row struct {
	Ts            int64  `json:"ts"`
	FmtTime       string `json:"fmt_time"`
	ReqCount      int64  `json:"req_count"`
	BytesIn       int64  `json:"bytes_in"`
	BytesOut      int64  `json:"bytes_out"`
	CacheHitCount int64  `json:"cache_hit_count"`
	Status2xx     int64  `json:"status_2xx"`
	Status3xx     int64  `json:"status_3xx"`
	Status4xx     int64  `json:"status_4xx"`
	Status5xx     int64  `json:"status_5xx"`
}

// QueryDomainRange 查询域名在指定时间范围内的 5 分钟聚合数据。
func (a *Aggregator) QueryDomainRange(domain string, start, end int64) ([]Row, error) {
	if a.db == nil {
		return nil, errors.New("db not initialized")
	}
	rows, err := a.db.Query(`SELECT ts, fmt_time, req_count, bytes_in, bytes_out, cache_hit_count, status_2xx, status_3xx, status_4xx, status_5xx FROM traffic_5m WHERE domain = ? AND ts >= ? AND ts < ? ORDER BY ts ASC`, domain, start, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Row
	for rows.Next() {
		var r Row
		if err := rows.Scan(&r.Ts, &r.FmtTime, &r.ReqCount, &r.BytesIn, &r.BytesOut, &r.CacheHitCount, &r.Status2xx, &r.Status3xx, &r.Status4xx, &r.Status5xx); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, nil
}

// hostOnly 提取主机名（去除端口）。
func hostOnly(h string) string {
	if i := strings.IndexByte(h, ':'); i >= 0 {
		return h[:i]
	}
	return h
}

// clientIP 提取远端 IP（去除端口）。

// rwx 包装 ResponseWriter 用于统计写出字节与最终状态码。
type rwx struct {
	http.ResponseWriter
	status int
	n      int64
}

// WriteHeader 记录状态码并透传。
func (w *rwx) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

// Write 累加写出的字节数并透传。
func (w *rwx) Write(b []byte) (int, error) {
	n, err := w.ResponseWriter.Write(b)
	w.n += int64(n)
	return n, err
}

// Handler 入口中间件，采集请求统计并调用下游处理器。
func (a *Aggregator) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		domain := a.normalizeDomain(hostOnly(r.Host))
		rec := &rwx{ResponseWriter: w, status: 0}
		next.ServeHTTP(rec, r)
		status := rec.status
		if status == 0 {
			status = 200
		}
		cacheHit := strings.EqualFold(rec.Header().Get("X-Cache"), "HIT")
		bytesOut := rec.n
		var bytesIn int64
		if r.ContentLength > 0 {
			bytesIn = r.ContentLength
		}
		a.Observe(domain, status, cacheHit, bytesOut, bytesIn)
	})
}
func (a *Aggregator) SetDomains(domains []string) {
	m := make(map[string]struct{}, len(domains))
	for _, d := range domains {
		if d != "" {
			m[d] = struct{}{}
		}
	}
	a.dmu.Lock()
	a.dom = m
	a.dmu.Unlock()
}

func (a *Aggregator) normalizeDomain(d string) string {
	a.dmu.RLock()
	_, ok := a.dom[d]
	a.dmu.RUnlock()
	if ok {
		return d
	}
	return "_unknown"
}

type EventLog struct {
	db   *sql.DB
	ch   chan Event
	stop chan struct{}
}

func NewEventLog() (*EventLog, error) {
	p := filepath.Join(".", "stats", "events.db")
	_ = os.MkdirAll(filepath.Dir(p), 0755)
	db, err := sql.Open("sqlite", p)
	if err != nil {
		return nil, err
	}
	_, _ = db.Exec(`PRAGMA journal_mode=WAL;`)
	_, _ = db.Exec(`PRAGMA synchronous=NORMAL;`)
	_, _ = db.Exec(`PRAGMA busy_timeout=3000;`)
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, details TEXT, ts INTEGER)`); err != nil {
		return nil, err
	}
	l := &EventLog{db: db, ch: make(chan Event, 1024), stop: make(chan struct{})}
	go l.loop()
	return l, nil
}

func (l *EventLog) Log(t string, details map[string]interface{}) {
	if l == nil || l.db == nil {
		return
	}
	b, _ := json.Marshal(details)
	ts := time.Now().Unix()
	e := Event{Type: t, Details: string(b), Ts: ts}
	select {
	case l.ch <- e:
	default:
	}
}

type Event struct {
	ID      int    `json:"id"`
	Type    string `json:"type"`
	Details string `json:"details"`
	Ts      int64  `json:"ts"`
}

func (l *EventLog) Recent() ([]Event, error) {
	if l == nil || l.db == nil {
		return nil, nil
	}
	rows, err := l.db.Query(`SELECT id, type, details, ts FROM events ORDER BY id DESC LIMIT 300`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Event
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.Type, &e.Details, &e.Ts); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, nil
}

func (l *EventLog) loop() {
	flush := time.NewTicker(1 * time.Second)
	clean := time.NewTicker(1 * time.Minute)
	buf := make([]Event, 0, 256)
	for {
		select {
		case e := <-l.ch:
			buf = append(buf, e)
			if len(buf) >= 256 {
				l.flush(buf)
				buf = buf[:0]
			}
		case <-flush.C:
			if len(buf) > 0 {
				l.flush(buf)
				buf = buf[:0]
			}
		case <-clean.C:
			_, _ = l.db.Exec(`DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY id DESC LIMIT 300)`)
		case <-l.stop:
			if len(buf) > 0 {
				l.flush(buf)
			}
			return
		}
	}
}

func (l *EventLog) flush(events []Event) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	tx, err := l.db.BeginTx(ctx, nil)
	if err != nil {
		return
	}
	for _, e := range events {
		_, _ = tx.ExecContext(ctx, `INSERT INTO events (type, details, ts) VALUES (?,?,?)`, e.Type, e.Details, e.Ts)
	}
	_ = tx.Commit()
}
