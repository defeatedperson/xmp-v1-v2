package function

import (
	"database/sql"
	"fmt"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// MonitorData 监控数据结构
type MonitorData struct {
	ID           int64     `json:"id"`
	Timestamp    time.Time `json:"timestamp"`
	CPUUsage     float64   `json:"cpu_usage"`
	MemoryUsage  float64   `json:"memory_usage"`
	DiskUsage    float64   `json:"disk_usage"`
	UploadMBps   float64   `json:"upload_mbps"`
	DownloadMBps float64   `json:"download_mbps"`
}

// Database 数据库操作结构
type Database struct {
	db     *sql.DB
	dbPath string
	mutex  sync.Mutex
}

// NewDatabase 创建数据库实例
func NewDatabase(dbPath string) (*Database, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败: %v", err)
	}

	database := &Database{
		db:     db,
		dbPath: dbPath,
	}

	// 创建表
	if err := database.createTable(); err != nil {
		return nil, fmt.Errorf("创建表失败: %v", err)
	}

	return database, nil
}

// createTable 创建监控数据表
func (d *Database) createTable() error {
	query := `
	CREATE TABLE IF NOT EXISTS monitor_data (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp DATETIME NOT NULL,
		cpu_usage REAL NOT NULL,
		memory_usage REAL NOT NULL,
		disk_usage REAL NOT NULL,
		upload_mbps REAL NOT NULL,
		download_mbps REAL NOT NULL,
		UNIQUE(timestamp)
	);
	
	CREATE INDEX IF NOT EXISTS idx_timestamp ON monitor_data(timestamp);
	`

	_, err := d.db.Exec(query)
	return err
}

// InsertOrUpdateData 插入或更新监控数据
// 如果同一时间点已存在数据，则比较并更新为较大值
func (d *Database) InsertOrUpdateData(data MonitorData) error {
	d.mutex.Lock()
	defer d.mutex.Unlock()

	// 检查是否已存在相同时间戳的数据
	var existingData MonitorData
	query := "SELECT id, cpu_usage, memory_usage, disk_usage, upload_mbps, download_mbps FROM monitor_data WHERE timestamp = ?"
	err := d.db.QueryRow(query, data.Timestamp).Scan(
		&existingData.ID,
		&existingData.CPUUsage,
		&existingData.MemoryUsage,
		&existingData.DiskUsage,
		&existingData.UploadMBps,
		&existingData.DownloadMBps,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			// 不存在，插入新数据
			insertQuery := `
			INSERT INTO monitor_data (timestamp, cpu_usage, memory_usage, disk_usage, upload_mbps, download_mbps)
			VALUES (?, ?, ?, ?, ?, ?)
			`
			_, err = d.db.Exec(insertQuery, data.Timestamp, data.CPUUsage, data.MemoryUsage, data.DiskUsage, data.UploadMBps, data.DownloadMBps)
			if err != nil {
				return fmt.Errorf("插入数据失败: %v", err)
			}
		} else {
			return fmt.Errorf("查询数据失败: %v", err)
		}
	} else {
		// 存在，比较并更新为较大值
		updateQuery := `
		UPDATE monitor_data SET 
			cpu_usage = ?,
			memory_usage = ?,
			disk_usage = ?,
			upload_mbps = ?,
			download_mbps = ?
		WHERE id = ?
		`

		// 比较并取较大值
		if data.CPUUsage > existingData.CPUUsage {
			existingData.CPUUsage = data.CPUUsage
		}
		if data.MemoryUsage > existingData.MemoryUsage {
			existingData.MemoryUsage = data.MemoryUsage
		}
		if data.DiskUsage > existingData.DiskUsage {
			existingData.DiskUsage = data.DiskUsage
		}
		if data.UploadMBps > existingData.UploadMBps {
			existingData.UploadMBps = data.UploadMBps
		}
		if data.DownloadMBps > existingData.DownloadMBps {
			existingData.DownloadMBps = data.DownloadMBps
		}

		_, err = d.db.Exec(updateQuery, existingData.CPUUsage, existingData.MemoryUsage, existingData.DiskUsage, existingData.UploadMBps, existingData.DownloadMBps, existingData.ID)
		if err != nil {
			return fmt.Errorf("更新数据失败: %v", err)
		}
	}

	// 清理7天前的数据
	return d.cleanOldData()
}

// GetDataByDay 获取指定天数的监控数据
// dayOffset: 0表示今天，1表示昨天，以此类推
func (d *Database) GetDataByDay(dayOffset int) ([]MonitorData, error) {
	d.mutex.Lock()
	defer d.mutex.Unlock()

	now := time.Now()
	startTime := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	startTime = startTime.AddDate(0, 0, -dayOffset)
	endTime := startTime.Add(24 * time.Hour)

	query := `
	SELECT id, timestamp, cpu_usage, memory_usage, disk_usage, upload_mbps, download_mbps
	FROM monitor_data
	WHERE timestamp >= ? AND timestamp < ?
	ORDER BY timestamp ASC
	`

	rows, err := d.db.Query(query, startTime, endTime)
	if err != nil {
		return nil, fmt.Errorf("查询数据失败: %v", err)
	}
	defer rows.Close()

	var results []MonitorData
	for rows.Next() {
		var data MonitorData
		scanErr := rows.Scan(
			&data.ID,
			&data.Timestamp,
			&data.CPUUsage,
			&data.MemoryUsage,
			&data.DiskUsage,
			&data.UploadMBps,
			&data.DownloadMBps,
		)
		if scanErr != nil {
			return nil, fmt.Errorf("扫描数据失败: %v", scanErr)
		}
		results = append(results, data)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历数据失败: %v", err)
	}

	return results, nil
}

// cleanOldData 清理7天前的数据
func (d *Database) cleanOldData() error {
	cutoffTime := time.Now().AddDate(0, 0, -7)
	query := "DELETE FROM monitor_data WHERE timestamp < ?"
	_, err := d.db.Exec(query, cutoffTime)
	return err
}

// Close 关闭数据库连接
func (d *Database) Close() error {
	return d.db.Close()
}

// GetLatestData 获取最新的监控数据
func (d *Database) GetLatestData() (*MonitorData, error) {
	d.mutex.Lock()
	defer d.mutex.Unlock()

	query := `
	SELECT id, timestamp, cpu_usage, memory_usage, disk_usage, upload_mbps, download_mbps
	FROM monitor_data
	ORDER BY timestamp DESC
	LIMIT 1
	`

	var data MonitorData
	err := d.db.QueryRow(query).Scan(
		&data.ID,
		&data.Timestamp,
		&data.CPUUsage,
		&data.MemoryUsage,
		&data.DiskUsage,
		&data.UploadMBps,
		&data.DownloadMBps,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("查询最新数据失败: %v", err)
	}

	return &data, nil
}
