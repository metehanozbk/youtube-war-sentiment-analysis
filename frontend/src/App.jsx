import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = "http://127.0.0.1:8000/api";

const PRESETS = [
  { url: "https://www.youtube.com/watch?v=CG0OOQr2bbw", phase: "Savaş Öncesi 1", name: "Savaş Öncesi - Video 1" },
  { url: "https://www.youtube.com/watch?v=83Gxpdw6U5Y", phase: "Savaş Öncesi 2", name: "Savaş Öncesi - Video 2" },
  { url: "https://www.youtube.com/watch?v=5OBgBQVNFJM", phase: "Savaş Sırası", name: "Savaş Sırası" },
  { url: "https://www.youtube.com/watch?v=zdi4S4Rguu4", phase: "Savaş Sonrası", name: "Savaş Sonrası" }
];

const formatPhaseName = (phase) => {
  switch (phase) {
    case "Savaş Öncesi 1":
      return "Savaş Öncesi 1 (< 13.06.2025)";
    case "Savaş Öncesi 2":
      return "Savaş Öncesi 2 (< 13.06.2025)";
    case "Savaş Öncesi":
      return "Savaş Öncesi (< 13.06.2025)";
    case "Savaş Sırası":
      return "Savaş Sırası (13.06.2025 - 13.10.2025)";
    case "Savaş Sonrası":
      return "Savaş Sonrası (>= 25.06.2025)";
    default:
      return phase;
  }
};

function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState("table");

  // Scraper
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [customUrl, setCustomUrl] = useState("");
  const [customPhase, setCustomPhase] = useState("Savaş Öncesi 1");
  const [maxComments, setMaxComments] = useState(0);
  const [scraperStatus, setScraperStatus] = useState({ running: false, progress: "", logs: [] });
  const [scrapedVideos, setScrapedVideos] = useState([]);
  
  // Tablo
  const [comments, setComments] = useState([]);
  const [totalComments, setTotalComments] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [search, setSearch] = useState("");
  const [filterPhase, setFilterPhase] = useState("");
  const [filterSentiment, setFilterSentiment] = useState("");

  // Stats State
  const [stats, setStats] = useState({ general: {}, by_phase: {} });

  // Backend bağlantı durumu
  const [backendReady, setBackendReady] = useState(false);
  const [backendStatus, setBackendStatus] = useState("connecting");
  const retryRef = useRef(null);

  // Model eğitim
  const [modelMetrics, setModelMetrics] = useState(null);
  const [trainingMessage, setTrainingMessage] = useState("");
  const [isTraining, setIsTraining] = useState(false);
  const [testText, setTestText] = useState("");
  const [testPrediction, setTestPrediction] = useState(null);

  // Spam modal
  const [spamModalOpen, setSpamModalOpen] = useState(false);
  const [spamComments, setSpamComments] = useState([]);
  const [spamModalTitle, setSpamModalTitle] = useState("");
  const [loadingSpam, setLoadingSpam] = useState(false);

  // Excel import
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  // Poll intervals
  const pollInterval = useRef(null);
  const logEndRef = useRef(null);

  // Backend hazır olana kadar bekle
  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 40;

    const tryConnect = async () => {
      try {
        const res = await fetch(`${API_BASE}/stats`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          setBackendReady(true);
          setBackendStatus("ready");
          return;
        }
      } catch (_) {}

      attempts++;
      if (attempts >= maxAttempts) {
        setBackendStatus("error");
        return;
      }
      retryRef.current = setTimeout(tryConnect, 1000);
    };

    tryConnect();
    return () => { if (retryRef.current) clearTimeout(retryRef.current); };
  }, []);

  // Backend hazır olunca başlangıç verilerini çek
  useEffect(() => {
    if (!backendReady) return;
    fetchStats();
    fetchVideos();
  }, [backendReady]);

  // Sayfa, arama veya filtreler değişince yorumları yeniden çek
  useEffect(() => {
    if (!backendReady) return;
    fetchComments();
  }, [backendReady, page, search, filterPhase, filterSentiment]);

  // Log scroll
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scraperStatus.logs]);

  // Temizlik
  useEffect(() => {
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, []);

  const fetchComments = async () => {
    try {
      const queryParams = new URLSearchParams({
        page,
        limit,
        search,
        phase: filterPhase,
        sentiment: filterSentiment
      });
      const response = await fetch(`${API_BASE}/comments?${queryParams}`);
      const data = await response.json();
      if (response.ok) {
        setComments(data.comments);
        setTotalComments(data.total);
      }
    } catch (error) {
      console.error("Yorumlar çekilirken hata:", error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/stats`);
      const data = await response.json();
      if (response.ok) {
        setStats(data);
      }
    } catch (error) {
      console.error("İstatistikler alınırken hata:", error);
    }
  };

  const fetchVideos = async () => {
    try {
      const response = await fetch(`${API_BASE}/videos`);
      const data = await response.json();
      if (response.ok) {
        setScrapedVideos(data);
      }
    } catch (error) {
      console.error("Videolar alınırken hata:", error);
    }
  };

  const handleDeleteVideo = async (videoId) => {
    if (!window.confirm("Bu videoya ait tüm yorumlar kalıcı olarak silinecek. Onaylıyor musunuz?")) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/videos/${videoId}`, {
        method: "DELETE"
      });
      const data = await response.json();
      if (response.ok) {
        alert(data.message);
        fetchVideos();
        fetchComments();
        fetchStats();
      } else {
        alert(data.detail || "Silme işlemi başarısız.");
      }
    } catch (error) {
      alert("Sunucu hatası oluştu.");
    }
  };

  const startPollingScraper = () => {
    if (pollInterval.current) clearInterval(pollInterval.current);
    
    pollInterval.current = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/status`);
        const data = await response.json();
        setScraperStatus(data);
        
        if (!data.running) {
          clearInterval(pollInterval.current);
          fetchComments();
          fetchStats();
          fetchVideos();
        }
      } catch (error) {
        console.error("Durum sorgulanırken hata:", error);
      }
    }, 1000);
  };

  const handleScrape = async () => {
    let url = PRESETS[selectedPreset].url;
    let phase = PRESETS[selectedPreset].phase;

    if (selectedPreset === -1) {
      url = customUrl;
      phase = customPhase;
    }

    if (!url) {
      alert("Lütfen geçerli bir YouTube URL'si girin.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, phase, max_comments: parseInt(maxComments) || 0 })
      });
      
      const data = await response.json();
      if (response.ok) {
        setScraperStatus(prev => ({ ...prev, running: true, logs: ["Gözlemci kuyruğa ekleniyor..."] }));
        startPollingScraper();
        setActiveTab("scraper");
      } else {
        alert(data.detail || "Kazıma işlemi başlatılamadı.");
      }
    } catch (error) {
      alert("Hata: Sunucuya bağlanılamadı.");
    }
  };

  const handleUpdateSentiment = async (commentId, newSentiment) => {
    try {
      const response = await fetch(`${API_BASE}/comments/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_id: commentId, sentiment: newSentiment })
      });
      if (response.ok) {
        if (newSentiment === "Spam") {
          setComments(comments.filter(c => c.Comment_ID !== commentId));
          setTotalComments(t => Math.max(0, t - 1));
        } else {
          setComments(comments.map(c => c.Comment_ID === commentId ? { ...c, Sentiment: newSentiment } : c));
        }
        fetchStats();
        fetchVideos();
      }
    } catch (error) {
      console.error("Duygu durumu güncellenemedi:", error);
    }
  };

  const handleShowSpam = async (videoId, videoTitle) => {
    setLoadingSpam(true);
    setSpamModalTitle(videoTitle);
    setSpamComments([]);
    setSpamModalOpen(true);
    try {
      const response = await fetch(`${API_BASE}/videos/${videoId}/spam`);
      const data = await response.json();
      if (response.ok) {
        setSpamComments(data.comments || []);
      } else {
        alert("Spam yorumlar yüklenemedi.");
      }
    } catch (error) {
      console.error("Spam yorumlar getirilemedi:", error);
      alert("Bir bağlantı hatası oluştu.");
    } finally {
      setLoadingSpam(false);
    }
  };

  const handleTrainModel = async () => {
    setIsTraining(true);
    setTrainingMessage("Model eğitiliyor, lütfen bekleyin...");
    try {
      const response = await fetch(`${API_BASE}/train`, { method: "POST" });
      const data = await response.json();
      if (data.success) {
        setModelMetrics(data.metrics);
        setTrainingMessage("Model başarıyla eğitildi ve kaydedildi!");
        fetchComments();
      } else {
        setTrainingMessage(`Eğitim başarısız: ${data.message}`);
        setModelMetrics(null);
      }
    } catch (error) {
      setTrainingMessage("Eğitim sırasında sunucu hatası oluştu.");
    } finally {
      setIsTraining(false);
    }
  };

  const handleAutoLabel = async () => {
    if (!window.confirm("Kalan tüm etiketsiz yorumlar yerel model tahminleri ile etiketlenecek. Onaylıyor musunuz?")) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/auto-label`, { method: "POST" });
      const data = await response.json();
      alert(data.message);
      fetchComments();
      fetchStats();
    } catch (error) {
      alert("Otomatik etiketleme sırasında hata oluştu.");
    }
  };

  const handleTestPredict = async () => {
    if (!testText) return;
    try {
      const response = await fetch(`${API_BASE}/test-predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: testText })
      });
      const data = await response.json();
      setTestPrediction(data);
    } catch (error) {
      console.error("Test tahmini sırasında hata:", error);
    }
  };

  const triggerExcelExport = () => {
    window.open(`${API_BASE}/export`, "_blank");
  };

  const handleExcelImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";

    setImporting(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/import-excel`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult({ ok: true, msg: `${data.total} satır yüklendi. Yeni: ${data.inserted}, Güncellenen: ${data.updated}` });
        fetchComments();
        fetchStats();
        fetchVideos();
      } else {
        setImportResult({ ok: false, msg: data.detail || "Yükleme başarısız." });
      }
    } catch {
      setImportResult({ ok: false, msg: "Sunucuya bağlanılamadı." });
    } finally {
      setImporting(false);
      setTimeout(() => setImportResult(null), 5000);
    }
  };

  const renderPhaseChart = (phase) => {
    const phaseStats = stats.by_phase[phase] || {};
    const total = Object.values(phaseStats).reduce((a, b) => a + b, 0);

    if (total === 0) {
      return (
        <div className="text-center p-4 text-muted" style={{fontSize: "0.85rem"}}>
          Bu aşama için veri çekilmedi.
        </div>
      );
    }

    const segments = ["Olumlu", "Olumsuz", "Nötr", "Alakasız", "Etiketsiz"];
    const colors = {
      "Olumlu": "var(--sentiment-positive)",
      "Olumsuz": "var(--sentiment-negative)",
      "Nötr": "var(--sentiment-neutral)",
      "Alakasız": "var(--sentiment-irrelevant)",
      "Etiketsiz": "var(--sentiment-unlabeled)"
    };

    return (
      <div className="chart-bar-group" style={{ marginBottom: '1.5rem' }}>
        <div className="chart-bar-label">
          <span>{formatPhaseName(phase)}</span>
          <span style={{color: 'var(--text-secondary)'}}>{total} Yorum</span>
        </div>
        <div className="chart-bar-bg" style={{ display: 'flex', height: '24px', borderRadius: '6px' }}>
          {segments.map(seg => {
            const count = phaseStats[seg] || 0;
            const pct = (count / total) * 100;
            if (count === 0) return null;
            return (
              <div 
                key={seg}
                style={{
                  width: `${pct}%`,
                  backgroundColor: colors[seg],
                  height: '100%',
                  transition: 'width 0.5s ease-in-out',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: '800',
                  color: '#fff',
                  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                  cursor: 'pointer'
                }}
                title={`${seg}: %${pct.toFixed(1)} (${count} yorum)`}
              >
                {pct > 8 && `${pct.toFixed(0)}%`}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
          {segments.map(seg => {
            const count = phaseStats[seg] || 0;
            if (count === 0) return null;
            return (
              <span key={seg} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: colors[seg] }}></span>
                {seg}: {count}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  if (!backendReady) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        gap: '1.5rem'
      }}>
        {backendStatus === 'error' ? (
          <>
            <div style={{ fontSize: '3rem' }}>⚠️</div>
            <div style={{ color: 'var(--text-primary)', fontSize: '1.2rem', fontWeight: '700' }}>Backend'e bağlanılamadı</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Lütfen <code>start.ps1</code> ile sistemi yeniden başlatın.</div>
            <button className="btn" onClick={() => { setBackendStatus('connecting'); setBackendReady(false); window.location.reload(); }}>Yeniden Dene</button>
          </>
        ) : (
          <>
            <div style={{
              width: '56px', height: '56px',
              border: '4px solid rgba(99,102,241,0.2)',
              borderTopColor: 'var(--color-accent)',
              borderRadius: '50%',
              animation: 'spin 0.9s linear infinite'
            }} />
            <div style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: '600' }}>Backend başlatılıyor...</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>API sunucusuna bağlanılıyor, lütfen bekleyin.</div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-section">
          <h1>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--color-accent)'}}>
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            12 Gün Savaşları - Yorum Analiz Kontrol Paneli
          </h1>
          <p>YouTube verilerini kazıyın, inceleyin ve kendi yapay zeka modelinizi yerel olarak eğitin</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {/* Gizli file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              style={{ display: 'none' }}
              onChange={handleExcelImport}
            />
            <button
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              title="Daha önce dışa aktarılmış Excel dosyasını geri yükle"
            >
              {importing ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Yükleniyor...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                  </svg>
                  Excel Yükle
                </>
              )}
            </button>
            <button className="btn btn-secondary" onClick={triggerExcelExport} disabled={comments.length === 0}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              Excel İndir
            </button>
          </div>
          {/* Yükleme sonuç bildirimi */}
          {importResult && (
            <div style={{
              fontSize: '0.78rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              background: importResult.ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
              border: `1px solid ${importResult.ok ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
              color: importResult.ok ? 'var(--sentiment-positive)' : 'var(--sentiment-negative)',
              maxWidth: '320px',
              textAlign: 'right'
            }}>
              {importResult.ok ? '✓' : '✗'} {importResult.msg}
            </div>
          )}
        </div>
      </header>

      {/* Stats Overview */}
      <section className="stats-summary-grid">
        <div className="glass-card stat-box">
          <div className="stat-value" style={{color: 'var(--text-primary)'}}>
            {Object.values(stats.general).reduce((a, b) => a + b, 0)}
          </div>
          <div className="stat-label">Toplam Çekilen Yorum</div>
        </div>
        <div className="glass-card stat-box">
          <div className="stat-value" style={{color: 'var(--sentiment-positive)'}}>
            {stats.general["Olumlu"] || 0}
          </div>
          <div className="stat-label">Olumlu Yorumlar</div>
        </div>
        <div className="glass-card stat-box">
          <div className="stat-value" style={{color: 'var(--sentiment-negative)'}}>
            {stats.general["Olumsuz"] || 0}
          </div>
          <div className="stat-label">Olumsuz Yorumlar</div>
        </div>
        <div className="glass-card stat-box">
          <div className="stat-value" style={{color: 'var(--sentiment-neutral)'}}>
            {stats.general["Nötr"] || 0}
          </div>
          <div className="stat-label">Nötr Yorumlar</div>
        </div>
        <div className="glass-card stat-box">
          <div className="stat-value" style={{color: 'var(--sentiment-irrelevant)'}}>
            {stats.general["Alakasız"] || 0}
          </div>
          <div className="stat-label">Alakasız Yorumlar</div>
        </div>
        <div className="glass-card stat-box">
          <div className="stat-value" style={{color: 'var(--sentiment-spam)'}}>
            {stats.general["Spam"] || 0}
          </div>
          <div className="stat-label">Spam Yorumlar</div>
        </div>
        <div className="glass-card stat-box">
          <div className="stat-value" style={{color: 'var(--sentiment-unlabeled)'}}>
            {stats.general["Etiketsiz"] || 0}
          </div>
          <div className="stat-label">Henüz Etiketsiz</div>
        </div>
      </section>

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* Left Side: Scraper Configuration */}
        <section className="glass-card">
          <h2 className="card-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            Yorum Verilerini Çek (Scraper)
          </h2>
          
          <div className="video-inputs-list">
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Ön Tanımlı Videoları Seçin:</label>
            </div>
            
            <div className="d-flex flex-column gap-2">
              {PRESETS.map((preset, index) => (
                <label 
                  key={index} 
                  className="d-flex align-center gap-2 p-2" 
                  style={{ 
                    background: selectedPreset === index ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                    border: '1px solid',
                    borderColor: selectedPreset === index ? 'var(--color-primary)' : 'var(--border-color)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                  onClick={() => setSelectedPreset(index)}
                >
                  <input 
                    type="radio" 
                    name="video_preset" 
                    checked={selectedPreset === index}
                    onChange={() => {}}
                  />
                  <div>
                    <strong>{preset.name}</strong> 
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{preset.url}</span>
                  </div>
                </label>
              ))}
              
              <label 
                className="d-flex align-center gap-2 p-2" 
                style={{ 
                  background: selectedPreset === -1 ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                  border: '1px solid',
                  borderColor: selectedPreset === -1 ? 'var(--color-primary)' : 'var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
                onClick={() => setSelectedPreset(-1)}
              >
                <input 
                  type="radio" 
                  name="video_preset" 
                  checked={selectedPreset === -1}
                  onChange={() => {}}
                />
                <div>
                  <strong>Özel Video URL'si Girin</strong>
                </div>
              </label>
            </div>

            {selectedPreset === -1 && (
              <div className="mt-4" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div className="video-input-row">
                  <label className="phase-badge-label">Video URL:</label>
                  <input 
                    type="text" 
                    placeholder="https://www.youtube.com/watch?v=..." 
                    className="input-field"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                  />
                </div>
                <div className="video-input-row">
                  <label className="phase-badge-label">Savaş Aşaması:</label>
                  <select 
                    className="select-field w-100"
                    value={customPhase}
                    onChange={(e) => setCustomPhase(e.target.value)}
                  >
                    <option value="Savaş Öncesi 1">{formatPhaseName("Savaş Öncesi 1")}</option>
                    <option value="Savaş Öncesi 2">{formatPhaseName("Savaş Öncesi 2")}</option>
                    <option value="Savaş Sırası">{formatPhaseName("Savaş Sırası")}</option>
                    <option value="Savaş Sonrası">{formatPhaseName("Savaş Sonrası")}</option>
                  </select>
                </div>
              </div>
            )}

            <div className="video-input-row mt-4">
              <label className="phase-badge-label">Çekilecek Adet:</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%' }}>
                <input 
                  type="number" 
                  min="0" 
                  className="input-field"
                  placeholder="Sınırsız için 0 girin"
                  value={maxComments}
                  onChange={(e) => setMaxComments(e.target.value === "" ? "" : parseInt(e.target.value))}
                  disabled={maxComments === 0 || maxComments === "0"}
                  style={{ flex: 1 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                  <input 
                    type="checkbox" 
                    checked={maxComments === 0 || maxComments === "0" || maxComments === ""}
                    onChange={(e) => setMaxComments(e.target.checked ? 0 : 200)}
                  />
                  Sınırsız (Tümü)
                </label>
              </div>
            </div>
          </div>

          <div className="scraper-actions">
            <button className="btn" onClick={handleScrape} disabled={scraperStatus.running}>
              {scraperStatus.running ? (
                <>
                  <span className="spinner">🔄</span> Kazınıyor...
                </>
              ) : (
                <>🚀 Yorumları Çek</>
              )}
            </button>
          </div>

          {/* Saved Videos Management */}
          {scrapedVideos.length > 0 && (
            <div className="mt-4" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
              <h3 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{color: 'var(--color-primary)'}}>
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                Veritabanındaki Kayıtlı Videolar
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                {scrapedVideos.map((video) => (
                  <div 
                    key={video.Video_ID} 
                    style={{ 
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '0.5rem 0.75rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.78rem',
                      gap: '0.75rem'
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong 
                        style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }} 
                        title={video.Video_Title}
                      >
                        {video.Video_Title}
                      </strong>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.15rem', alignItems: 'center' }}>
                        <span className={`phase-pre ${video.War_Phase.includes('1') ? 'phase-pre' : video.War_Phase.includes('2') ? 'phase-pre' : video.War_Phase.includes('Sırası') ? 'phase-during' : 'phase-post'}`} style={{ fontSize: '0.68rem', fontWeight: '700' }}>
                          {formatPhaseName(video.War_Phase)}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>({video.comment_count} Yorum)</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.68rem', borderRadius: '4px', border: '1px solid var(--sentiment-spam-border)', color: 'var(--sentiment-spam)' }}
                        onClick={() => handleShowSpam(video.Video_ID, video.Video_Title)}
                      >
                        Spamları Göster
                      </button>
                      <button 
                        className="btn btn-danger" 
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.68rem', borderRadius: '4px' }}
                        onClick={() => handleDeleteVideo(video.Video_ID)}
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Right Side: Quick Analytics or Live Scraper Logs */}
        <section className="glass-card">
          {scraperStatus.running || activeTab === "scraper" ? (
            <>
              <h2 className="card-title">
                <span className="spinner">🔄</span> Kazıcı Konsol Logları
              </h2>
              <div className="log-container">
                {scraperStatus.logs.map((log, i) => (
                  <div key={i} className="log-entry">{log}</div>
                ))}
                <div ref={logEndRef} />
              </div>
              <button className="btn btn-secondary mt-4" onClick={() => setActiveTab("table")}>
                Tablo Görünümüne Dön
              </button>
            </>
          ) : (
            <div className="chart-container">
              <h2 className="card-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
                Aşamalara Göre Duygu Değişimi
              </h2>
              {renderPhaseChart("Savaş Öncesi 1")}
              {renderPhaseChart("Savaş Öncesi 2")}
              {renderPhaseChart("Savaş Sırası")}
              {renderPhaseChart("Savaş Sonrası")}
            </div>
          )}
        </section>
      </div>

      {/* Bottom Interface: Tabbed Section */}
      <section className="glass-card">
        <div className="tabs-header">
          <button className={`tab-btn ${activeTab === 'table' ? 'active' : ''}`} onClick={() => setActiveTab('table')}>
            📊 Yorum Veri Tablosu
          </button>
          <button className={`tab-btn ${activeTab === 'train' ? 'active' : ''}`} onClick={() => setActiveTab('train')}>
            🧠 Yapay Zeka Model Eğitimi
          </button>
        </div>

        {/* Tab 1: Interactive Table */}
        {activeTab === 'table' && (
          <div>
            <div className="table-controls">
              <div className="search-filter-box">
                <input 
                  type="text" 
                  placeholder="Yorum içinde ara..." 
                  className="input-field" 
                  style={{ width: '220px' }}
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
                
                <select 
                  className="select-field"
                  value={filterPhase}
                  onChange={(e) => { setFilterPhase(e.target.value); setPage(1); }}
                >
                  <option value="">Tüm Aşamalar</option>
                  <option value="Savaş Öncesi 1">{formatPhaseName("Savaş Öncesi 1")}</option>
                  <option value="Savaş Öncesi 2">{formatPhaseName("Savaş Öncesi 2")}</option>
                  <option value="Savaş Sırası">{formatPhaseName("Savaş Sırası")}</option>
                  <option value="Savaş Sonrası">{formatPhaseName("Savaş Sonrası")}</option>
                </select>

                <select 
                  className="select-field"
                  value={filterSentiment}
                  onChange={(e) => { setFilterSentiment(e.target.value); setPage(1); }}
                >
                  <option value="">Tüm Duygular</option>
                  <option value="Olumlu">Olumlu</option>
                  <option value="Olumsuz">Olumsuz</option>
                  <option value="Nötr">Nötr</option>
                  <option value="Alakasız">Alakasız</option>
                  <option value="Etiketsiz">Etiketsiz</option>
                </select>
              </div>

              <div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Toplam <strong>{totalComments}</strong> satır veri
                </span>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="excel-table">
                <thead>
                  <tr>
                    <th>Duygu</th>
                    <th>Yazar</th>
                    <th>Yorum Metni</th>
                    <th>Aşama</th>
                    <th>Beğeni</th>
                    <th>Zaman</th>
                    <th>Kalp</th>
                    <th>Yanıt Mı?</th>
                    <th>Yorum ID</th>
                    <th>Video ID</th>
                    <th>Video Başlığı</th>
                  </tr>
                </thead>
                <tbody>
                  {comments.length === 0 ? (
                    <tr>
                      <td colSpan="11" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        Yorum bulunamadı. Lütfen üstteki panelden yorum çekin.
                      </td>
                    </tr>
                  ) : (
                    comments.map((comment) => (
                      <tr key={comment.Comment_ID}>
                        <td>
                          <select 
                            className={`sentiment-badge-select ${comment.Sentiment || 'Etiketsiz'}`}
                            value={comment.Sentiment || 'Etiketsiz'}
                            onChange={(e) => handleUpdateSentiment(comment.Comment_ID, e.target.value)}
                          >
                            <option value="Etiketsiz">Etiketsiz</option>
                            <option value="Olumlu">Olumlu</option>
                            <option value="Olumsuz">Olumsuz</option>
                            <option value="Nötr">Nötr</option>
                            <option value="Alakasız">Alakasız</option>
                            <option value="Spam">Spam</option>
                          </select>
                        </td>
                        <td className="avatar-cell">
                          <img 
                            src={comment.Author_DisplayName ? (comment.photo || "") : ""} 
                            alt="" 
                            className="user-photo" 
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                          <span>{comment.Author_DisplayName}</span>
                        </td>
                        <td title={comment.Text} style={{ whiteSpace: 'normal', minWidth: '220px', maxWidth: '400px', wordBreak: 'break-word' }}>
                          {comment.Text}
                        </td>
                        <td>
                          <span className={`phase-pre ${comment.War_Phase.includes('Öncesi') ? 'phase-pre' : comment.War_Phase.includes('Sırası') ? 'phase-during' : 'phase-post'}`} style={{fontSize: '0.8rem', fontWeight: '700'}}>
                            {formatPhaseName(comment.War_Phase)}
                          </span>
                        </td>
                        <td>{comment.LikeCount}</td>
                        <td>{comment.PublishedAt}</td>
                        <td className="text-center">
                          {comment.heart ? <span className="heart-icon">❤️</span> : <span style={{color: 'var(--text-muted)'}}>-</span>}
                        </td>
                        <td>{comment.Is_Reply ? "Evet" : "Hayır"}</td>
                        <td title={comment.Comment_ID} style={{fontSize: '0.75rem', fontFamily: 'monospace'}}>{comment.Comment_ID}</td>
                        <td style={{fontSize: '0.75rem', fontFamily: 'monospace'}}>{comment.Video_ID}</td>
                        <td title={comment.Video_Title}>{comment.Video_Title}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalComments > limit && (
              <div className="pagination">
                <div>
                  Sayfa {page} / {Math.ceil(totalComments / limit)}
                </div>
                <div className="pagination-buttons">
                  <button 
                    className="pagination-btn"
                    disabled={page === 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    ◀
                  </button>
                  <button 
                    className="pagination-btn"
                    disabled={page >= Math.ceil(totalComments / limit)}
                    onClick={() => setPage(p => p + 1)}
                  >
                    ▶
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Model Training */}
        {activeTab === 'train' && (
          <div className="training-section-container">
            {/* Training Controls */}
            <div>
              <h3 className="mb-2" style={{fontSize: '1rem'}}>Yerel Modeli Eğitme ve Durumu</h3>
              <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem'}}>
                Kendi işaretlediğiniz veya güncellediğiniz yorum etiketleri veritabanına kaydedilir. 
                Yeterince yorum etiketledikten sonra, yerel modelinizi eğiterek kalan yorumları otomatik olarak etiketlemesini sağlayabilirsiniz.
              </p>

              <div className="d-flex gap-2 mb-2">
                <button 
                  className="btn btn-accent" 
                  onClick={handleTrainModel} 
                  disabled={isTraining}
                >
                  {isTraining ? "Model Eğitiliyor..." : "🧠 Yerel Yapay Zeka Modelini Eğit"}
                </button>

                <button 
                  className="btn btn-secondary" 
                  onClick={handleAutoLabel}
                  disabled={!modelMetrics}
                  title="Eğitilmiş yerel model ile kalan tüm yorumları sınıflandırır."
                >
                  🤖 Kalan Yorumları Otomatik Sınıflandır
                </button>
              </div>

              {trainingMessage && (
                <div style={{ 
                  background: 'rgba(255, 255, 255, 0.05)', 
                  border: '1px solid var(--border-color)', 
                  padding: '0.75rem', 
                  borderRadius: '8px', 
                  fontSize: '0.85rem',
                  marginTop: '0.5rem',
                  color: isTraining ? 'var(--color-primary)' : 'var(--text-primary)'
                }}>
                  {trainingMessage}
                </div>
              )}

              {/* Prediction Tester */}
              <div className="glass-card mt-4" style={{ padding: '1rem' }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Eğitilen Modeli Anlık Test Et</h4>
                <div className="inline-form">
                  <input 
                    type="text" 
                    placeholder="Denemek için bir yorum yazın... (Örn: Bu savaş canımı çok acıttı)" 
                    className="input-field"
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                  />
                  <button className="btn" onClick={handleTestPredict} disabled={!testText}>
                    Test Et
                  </button>
                </div>
                {testPrediction && (
                  <div style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
                    Tahmin Edilen Sınıf: <strong style={{
                      color: testPrediction.sentiment === 'Olumlu' ? 'var(--sentiment-positive)' : 
                             testPrediction.sentiment === 'Olumsuz' ? 'var(--sentiment-negative)' :
                             testPrediction.sentiment === 'Nötr' ? 'var(--sentiment-neutral)' : 'var(--sentiment-irrelevant)'
                    }}>{testPrediction.sentiment}</strong> 
                    <span style={{color: 'var(--text-muted)'}}> (Güven Oranı: %{(testPrediction.confidence * 100).toFixed(1)})</span>
                  </div>
                )}
              </div>
            </div>

            {/* Metrics Panel */}
            <div className="matrix-container">
              <h3 className="mb-2" style={{fontSize: '1rem', color: 'var(--text-primary)'}}>Model Performans Metrikleri</h3>
              {!modelMetrics ? (
                <div className="text-center p-4 text-muted" style={{fontSize: '0.85rem'}}>
                  Model henüz eğitilmedi veya metrik yok. Eğitimi başlatmak için soldaki butonu kullanın. (En az 10 adet etiketlenmiş yorum ve en az 2 farklı duygu sınıfı gereklidir).
                </div>
              ) : (
                <div>
                  <div className="metric-card-group">
                    <div className="metric-mini-box">
                      <div className="metric-mini-val">{(modelMetrics.accuracy * 100).toFixed(1)}%</div>
                      <div className="metric-mini-lbl">Doğruluk Oranı (Accuracy)</div>
                    </div>
                    <div className="metric-mini-box">
                      <div className="metric-mini-val">{modelMetrics.total_labeled}</div>
                      <div className="metric-mini-lbl">Eğitilen Toplam Veri</div>
                    </div>
                  </div>

                  <div style={{ margin: '1rem 0' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Duygu Sınıfları Dağılımı:</div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {Object.entries(modelMetrics.class_counts).map(([cls, cnt]) => (
                        <span key={cls} className="phase-badge-label" style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}>
                          {cls}: {cnt}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Karışıklık Matrisi (Confusion Matrix)</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Satırlar: Gerçek Değer | Sütunlar: Model Tahmini</div>
                    
                    <div className="matrix-grid">
                      <div className="matrix-header-cell">Gerçek\Tahmin</div>
                      {modelMetrics.labels.map(lbl => (
                        <div key={lbl} className="matrix-header-cell">{lbl}</div>
                      ))}

                      {modelMetrics.labels.map(trueLbl => (
                        <React.Fragment key={trueLbl}>
                          <div className="matrix-row-header">{trueLbl}</div>
                          {modelMetrics.labels.map(predLbl => {
                            const val = modelMetrics.confusion_matrix[trueLbl]?.[predLbl] ?? 0;
                            const isDiagonal = trueLbl === predLbl;
                            return (
                              <div 
                                key={predLbl} 
                                className={`matrix-cell ${isDiagonal ? 'diagonal' : ''} ${val === 0 ? 'zero' : ''}`}
                                title={`Gerçek ${trueLbl} yorumlarından ${val} tanesi ${predLbl} olarak tahmin edildi.`}
                              >
                                {val}
                              </div>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Spam Yorumlar Modalı */}
      {spamModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '2rem'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '900px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            overflow: 'hidden',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            background: '#0a0f1d'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--sentiment-spam)' }}>
                ⚠️ Spam Yorumlar - {spamModalTitle}
              </h3>
              <button 
                onClick={() => setSpamModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0.2rem'
                }}
              >
                &times;
              </button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', minHeight: '300px', maxHeight: '55vh' }}>
              {loadingSpam ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', gap: '0.5rem' }}>
                  <span className="spinner">🔄</span> Yükleniyor...
                </div>
              ) : spamComments.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: 'var(--text-muted)' }}>
                  Bu videoda tespit edilmiş spam yorum bulunmamaktadır.
                </div>
              ) : (
                <table className="excel-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '120px' }}>Duygu</th>
                      <th style={{ width: '180px' }}>Yazar</th>
                      <th>Yorum Metni</th>
                      <th style={{ width: '150px' }}>Tarih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spamComments.map((comment) => (
                      <tr key={comment.Comment_ID}>
                        <td>
                          <select 
                            className="sentiment-badge-select Spam"
                            value={comment.Sentiment}
                            onChange={async (e) => {
                              const newSentiment = e.target.value;
                              try {
                                const response = await fetch(`${API_BASE}/comments/update`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ comment_id: comment.Comment_ID, sentiment: newSentiment })
                                });
                                if (response.ok) {
                                  // Update state in modal
                                  setSpamComments(prev => prev.filter(c => c.Comment_ID !== comment.Comment_ID));
                                  // Trigger stats and comments reload
                                  fetchComments();
                                  fetchStats();
                                  fetchVideos();
                                }
                              } catch (err) {
                                console.error("Spam sentiment güncelleme hatası:", err);
                              }
                            }}
                          >
                            <option value="Spam">Spam</option>
                            <option value="Etiketsiz">Etiketsiz</option>
                            <option value="Olumlu">Olumlu</option>
                            <option value="Olumsuz">Olumsuz</option>
                            <option value="Nötr">Nötr</option>
                            <option value="Alakasız">Alakasız</option>
                          </select>
                        </td>
                        <td>{comment.Author_DisplayName}</td>
                        <td title={comment.Text} style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                          {comment.Text}
                        </td>
                        <td>{comment.PublishedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={() => setSpamModalOpen(false)}>
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
