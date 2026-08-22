package certs

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type Manager struct {
	mu          sync.RWMutex
	root        string
	defaultCert tls.Certificate
	domainCerts map[string]tls.Certificate
	snap        atomic.Value
}

func New(root string) (*Manager, error) {
	m := &Manager{root: root, domainCerts: make(map[string]tls.Certificate)}
	if err := os.MkdirAll(root, 0755); err != nil {
		return nil, err
	}
	if err := m.ensureDefault(); err != nil {
		return nil, err
	}
	if err := m.reload(); err != nil {
		return nil, err
	}
	m.snap.Store(m.domainCerts)
	return m, nil
}

func (m *Manager) ensureDefault() error {
	p := filepath.Join(m.root, "default")
	if err := os.MkdirAll(p, 0755); err != nil {
		return err
	}
	crt := filepath.Join(p, "server.crt")
	key := filepath.Join(p, "server.key")
	if _, err := os.Stat(crt); err == nil {
		if _, e2 := os.Stat(key); e2 == nil {
			bcrt, _ := os.ReadFile(crt)
			bkey, _ := os.ReadFile(key)
			c, err := tls.X509KeyPair(bcrt, bkey)
			if err == nil {
				m.defaultCert = c
				return nil
			}
		}
	}
	certPEM, keyPEM, err := generateCert([]string{"localhost", "127.0.0.1"}, time.Hour*24*365)
	if err != nil {
		return err
	}
	_ = os.WriteFile(crt, certPEM, 0644)
	_ = os.WriteFile(key, keyPEM, 0600)
	c, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return err
	}
	m.defaultCert = c
	return nil
}

func (m *Manager) reload() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	mc := make(map[string]tls.Certificate)
	ents, err := os.ReadDir(m.root)
	if err != nil {
		return err
	}
	for _, e := range ents {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if name == "default" {
			continue
		}
		dir := filepath.Join(m.root, name)
		crt := filepath.Join(dir, "server.crt")
		key := filepath.Join(dir, "server.key")
		bcrt, erc := os.ReadFile(crt)
		if erc != nil {
			continue
		}
		bkey, erk := os.ReadFile(key)
		if erk != nil {
			continue
		}
		c, err := tls.X509KeyPair(bcrt, bkey)
		if err != nil {
			continue
		}
		mc[strings.ToLower(strings.TrimSuffix(name, "."))] = c
	}
	m.domainCerts = mc
	m.snap.Store(mc)
	return nil
}

func (m *Manager) Reload() error {
	return m.reload()
}

func (m *Manager) GetCertificate(chi *tls.ClientHelloInfo) (*tls.Certificate, error) {
	if chi != nil {
		if v := m.snap.Load(); v != nil {
			dm := v.(map[string]tls.Certificate)
			sn := chi.ServerName
			if sn != "" {
				sn = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(sn), "."))
				if c, ok := dm[sn]; ok {
					return &c, nil
				}
			}
		}
	}
	return &m.defaultCert, nil
}

func generateCert(hosts []string, validFor time.Duration) ([]byte, []byte, error) {
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, nil, err
	}
	serialNumberLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serialNumber, err := rand.Int(rand.Reader, serialNumberLimit)
	if err != nil {
		return nil, nil, err
	}
	tmpl := x509.Certificate{
		SerialNumber:          serialNumber,
		Subject:               pkix.Name{Organization: []string{"xcc-lite"}},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(validFor),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}
	for _, h := range hosts {
		if ip := net.ParseIP(h); ip != nil {
			tmpl.IPAddresses = append(tmpl.IPAddresses, ip)
		} else {
			tmpl.DNSNames = append(tmpl.DNSNames, h)
		}
	}
	derBytes, err := x509.CreateCertificate(rand.Reader, &tmpl, &tmpl, &priv.PublicKey, priv)
	if err != nil {
		return nil, nil, err
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: derBytes})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(priv)})
	return certPEM, keyPEM, nil
}
