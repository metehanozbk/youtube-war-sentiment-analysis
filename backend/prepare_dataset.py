import os
import sys
import random
import sqlite3
import pandas as pd
import numpy as np

# Add parent directory or current directory to path if needed
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import database
import scraper
import classifier

def main():
    print("--- ADIM 1: Savaş Sırası Videolarından Yorum Kazıma ---")
    url = "https://www.youtube.com/watch?v=5OBgBQVNFJM"
    phase = "Savaş Sırası"
    
    print(f"URL: {url}")
    print(f"Aşama: {phase}")
    print("Yorumlar kazınıyor (tarih filtresi: 13 Haziran 2025 - 13 Ekim 2025)...")
    
    # Scrape comments (unlimited)
    comments = scraper.scrape_comments_for_video(url, phase, max_comments=0, log_callback=print)
    print(f"Kazınan ve tarih filtresine uyan yorum sayısı: {len(comments)}")
    
    if comments:
        print("Yorumlar veritabanına ekleniyor...")
        inserted, updated = database.insert_comments(comments, trigger_backup_after=False)
        print(f"Veritabanına ekleme tamamlandı. Yeni eklenen: {inserted}, Güncellenen/Aynı: {updated}")
    else:
        print("Filtrelere uyan yeni yorum bulunamadı veya kazınamadı.")
        
    print("\n--- ADIM 2: Veritabanından Durum Kontrolü ---")
    conn = database.get_connection()
    df_all = pd.read_sql_query("SELECT Comment_ID, Sentiment, War_Phase, Text FROM comments", conn)
    conn.close()
    
    total_comments = len(df_all)
    spam_comments = df_all[df_all["Sentiment"] == "Spam"]
    non_spam_comments = df_all[df_all["Sentiment"] != "Spam"]
    
    print(f"Toplam yorum sayısı (Spam dahil): {total_comments}")
    print(f"Spam yorum sayısı: {len(spam_comments)}")
    print(f"Spam olmayan yorum sayısı: {len(non_spam_comments)}")
    
    # Let's count how many have valid sentiment label (not Etiketsiz)
    labeled_mask = non_spam_comments["Sentiment"].isin(["Olumlu", "Olumsuz", "Nötr", "Alakasız"])
    labeled_comments = non_spam_comments[labeled_mask]
    print(f"Hali hazırda etiketli olan (Spam hariç) yorum sayısı: {len(labeled_comments)}")
    
    # Target manual labels count = 10% of total non-spam comments
    target_labeled_count = max(10, int(len(non_spam_comments) * 0.1))
    print(f"Hedeflenen %10 manuel etiketli yorum sayısı: {target_labeled_count}")
    
    if len(labeled_comments) < target_labeled_count:
        print("UYARI: Hali hazırda etiketli yorum sayısı, hedeflenen %10'dan az! Mevcut etiketlilerin tamamı korunacak.")
        keep_labeled = labeled_comments
    else:
        # Stratified sampling of labeled comments to get exactly target_labeled_count
        # We group by Sentiment and sample proportionally to keep class balance
        ratios = labeled_comments["Sentiment"].value_counts(normalize=True)
        keep_list = []
        for sentiment, ratio in ratios.items():
            sub_df = labeled_comments[labeled_comments["Sentiment"] == sentiment]
            n_sample = max(1, int(round(ratio * target_labeled_count)))
            if n_sample > len(sub_df):
                n_sample = len(sub_df)
            keep_list.append(sub_df.sample(n=n_sample, random_state=42))
            
        keep_labeled = pd.concat(keep_list)
        # If we sampled slightly more/less due to rounding, adjust to target_labeled_count
        if len(keep_labeled) > target_labeled_count:
            keep_labeled = keep_labeled.sample(n=target_labeled_count, random_state=42)
        elif len(keep_labeled) < target_labeled_count and len(labeled_comments) > len(keep_labeled):
            remaining = labeled_comments[~labeled_comments["Comment_ID"].isin(keep_labeled["Comment_ID"])]
            n_needed = target_labeled_count - len(keep_labeled)
            additional = remaining.sample(n=min(n_needed, len(remaining)), random_state=42)
            keep_labeled = pd.concat([keep_labeled, additional])
            
    print(f"Seçilen %10 etiketli yorum sayısı: {len(keep_labeled)}")
    print("Sınıf dağılımı:")
    print(keep_labeled["Sentiment"].value_counts())
    
    # Update database: Set all non-selected and non-spam comments to 'Etiketsiz'
    print("\n--- ADIM 3: Veritabanı Etiketlerinin Güncellenmesi (%10 Manuel, %90 Etiketsiz) ---")
    keep_ids = set(keep_labeled["Comment_ID"])
    
    conn = database.get_connection()
    cursor = conn.cursor()
    
    # Fetch all comment ids that are not spam
    cursor.execute("SELECT Comment_ID, Sentiment FROM comments WHERE Sentiment != 'Spam'")
    rows = cursor.fetchall()
    
    update_tuples = []
    for row in rows:
        cid = row["Comment_ID"]
        curr_sentiment = row["Sentiment"]
        if cid in keep_ids:
            # We want to keep its original label. But wait, if it was 'Etiketsiz' (unlabeled),
            # we should keep its label? No, keep_ids only contains comments that were already labeled.
            # So its Sentiment is already correct.
            pass
        else:
            # Set to 'Etiketsiz'
            if curr_sentiment != 'Etiketsiz':
                update_tuples.append(('Etiketsiz', cid))
                
    if update_tuples:
        print(f"{len(update_tuples)} yorumun etiketi 'Etiketsiz' olarak güncelleniyor...")
        cursor.executemany("UPDATE comments SET Sentiment = ? WHERE Comment_ID = ?", update_tuples)
        conn.commit()
    else:
        print("Güncellenecek etiket bulunamadı.")
        
    conn.close()
    
    print("\n--- ADIM 4: Sınıflandırıcı Modelin %10 Veri ile Eğitilmesi ---")
    train_res = classifier.train_model()
    print("Model Eğitim Sonucu:")
    print(train_res)
    
    print("\n--- ADIM 5: Kalan %90 Yorumun Model Tarafından Otomatik Etiketlenmesi ---")
    auto_labeled = classifier.auto_label_unlabeled()
    print(f"Otomatik etiketlenen yorum sayısı: {auto_labeled}")
    
    print("\n--- ADIM 6: Değişikliklerin Excel Yedeğine Kaydedilmesi ---")
    database.backup_db_to_excel()
    print("Tamamlandı! Tüm işlemler başarıyla gerçekleştirildi.")

if __name__ == "__main__":
    main()
