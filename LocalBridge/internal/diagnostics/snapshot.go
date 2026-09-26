// Package diagnostics builds the same diagnostic archive for Web and Desktop.
package diagnostics

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type OpenedFile struct {
	FilePath string `json:"filePath"`
	FileName string `json:"fileName"`
	Current  bool   `json:"current"`
}

type Payload struct {
	FrontendLogs  map[string]interface{} `json:"frontend_logs"`
	FrontendState map[string]interface{} `json:"frontend_state"`
	OpenedFiles   []OpenedFile           `json:"opened_files"`
	Manifest      map[string]interface{} `json:"manifest"`
}

type Snapshot struct {
	Warnings   []string `json:"warnings,omitempty"`
	Root       string   `json:"root"`
	Version    string   `json:"version"`
	LogDir     string   `json:"logDirectory"`
	MFWDir     string   `json:"mfwLogDirectory"`
	DesktopDir string   `json:"desktopLogDirectory,omitempty"`
	CapturedAt string   `json:"frontendCapturedAt,omitempty"`
	Payload    Payload  `json:"payload"`
}

type Recorder struct {
	mu      sync.Mutex
	path    string
	context Snapshot
}

func NewRecorder(path string, context Snapshot) (*Recorder, error) {
	r := &Recorder{path: path, context: context}
	return r, r.save(context)
}

func (r *Recorder) Capture(payload Payload) (Snapshot, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	snapshot := r.context
	snapshot.Payload = payload
	snapshot.CapturedAt = time.Now().UTC().Format(time.RFC3339Nano)
	return snapshot, r.save(snapshot)
}

func (r *Recorder) save(snapshot Snapshot) error {
	data, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}
	if len(data) > 32*1024*1024 {
		return fmt.Errorf("前端诊断快照超过 32 MB")
	}
	if err = os.MkdirAll(filepath.Dir(r.path), 0700); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(r.path), ".diagnostics-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if _, err = f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), r.path)
}

func ReadSnapshot(path string) (Snapshot, error) {
	var snapshot Snapshot
	data, err := os.ReadFile(path)
	if err != nil {
		return snapshot, err
	}
	err = json.Unmarshal(data, &snapshot)
	return snapshot, err
}
