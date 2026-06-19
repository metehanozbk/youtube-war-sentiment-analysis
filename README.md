# YouTube Savaş Analizi ve Zamansal Duygu Değişimi Sistemi

Lokal donanımda çalışan, makro-politik kriz dönemlerinde YouTube üzerinde oluşan kullanıcı yorumlarını (UGC) asenkron olarak kazıyan, zaman pencerelerine göre dönemselleştiren ve yapay zeka ile duygu/tutum analizi yapan bütüncül bir framework.

## 🚀 Öne Çıkan Özellikler
* **Tamamen Lokal & Gizlilik Odaklı:** Harici bulut API'lerine (OpenAI, Claude vb.) bağımlılık ve tekrarlayan maliyetler yoktur. Tüm ML süreçleri lokal donanımda koşturulur.
* **Zamansal Veri Kayması (Data Drift) Yönetimi:** Doğrusal zaman akışı yerine, belirlenen bir çapa tarih (Anchor Date $T_0$) referans alınarak veriler *Savaş Öncesi*, *Savaş Sırası* ve *Savaş Sonrası* olarak dinamik fazlara (War Phases) ayrılır.
* **Gelişmiş Veri Kilitleme (Conflict Prevention):** Dışarıdan Excel ile toplu veri yüklemelerinde veya yeniden kazıma işlemlerinde, araştırmacının manuel olarak işlediği altın etiketlerin (Ground Truth) üzerine yazılması veritabanı seviyesinde engellenir.
* **İnsan-Döngüde (Human-in-the-Loop) Deneysel Tasarım:** İlk videolardan %10 tabakalı örneklem ile "Gold Dataset" oluşturulurken, son video veri kaymasını saf gözlemlemek için model eğitiminden izole kontrol grubu olarak saklanır.

## 🛠️ Teknolojik Yığın (Tech Stack)

| Katman | Teknoloji | Fonksiyonu |
| :--- | :--- | :--- |
| **Backend** | FastAPI / Python | Asenkron veri işleme, veri hattı (pipeline) kontrolü ve lokal REST API. |
| **Frontend** | React.js | Gerçek zamanlı zaman serisi grafikleri, Confusion Matrix ve analitik dashboard. |
| **Veri Depolama** | SQLite | Sıfır konfigürasyonlu, dosya tabanlı lokal ilişkisel veritabanı. |
| **Makine Öğrenimi** | Scikit-Learn | TF-IDF Vektörizasyonu, Lojistik Regresyon ve Doğrusal SVM modelleri. |
| **Otomasyon** | Shell Scripts (.bat) | Tek tıkla servisleri ayağa kaldıran ve önbellek temizleyen taşınabilirlik betikleri. |

## 📊 Model Başarım Metrikleri (Baseline)

1.547 adet kontrollü etiketli veri (Gold Dataset) üzerinden eğitilen yerel **Model A**, kısa ve gürültülü sosyal medya metinlerinde yüksek kararlılık göstermiştir:

* **Genel Doğruluk (Accuracy):** %88.7
* **Toplam Analiz Edilen Hacim:** 9.059 Yorum
* **Sınıf Dengesizliği Toleransı:** Model, örneklem sayısı kısıtlı olan *Olumsuz* ve *Nötr* sınıflarında yanlış pozitif (false positive) üretmeyerek ezici çoğunluk sınıfının baskısını absorbe etmiştir.

## 📂 Metodoloji ve Zaman Pencereleri

Sistem, toplumsal şokun yaşandığı ana kırılma noktasını çapa tarih (**Anchor $T_0 = 13.06.2025$**) olarak kabul eder:
1. **Savaş Öncesi (Pre-Event):** $T_0$ öncesi stabil dönem. (459 Yorum)
2. **Savaş Sırası (Event Window):** $13.06.2025 \le t < 25.06.2025$ arası yoğun kriz ve şok dönemi. (1.185 Yorum)
3. **Savaş Sonrası (Post-Event):** $\ge 25.06.2025$ normalleşme dönemi. (7.415 Yorum - *Yapay zeka sapmalarını önlemek için duygu motoru kapalı tutulmuş, spam filtresi aktif bırakılmıştır.*)

## 🔧 Kurulum ve Çalıştırma

### Gereksinimler
* Python 3.10+
* Node.js v18+

### Tek Tıkla Başlatma (Windows)
Proje dizinindeki otomasyon betiğini çalıştırarak hem backend'i hem frontend'i aynı anda ayağa kaldırabilirsiniz:
```bash
./automation/start.bat