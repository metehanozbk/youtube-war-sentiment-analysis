import os
import sys
import pandas as pd

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import database

def main():
    print("--- Veritabanını %10 Etiketli Sürümüne Sıfırlama ---")
    
    conn = database.get_connection()
    df_all = pd.read_sql_query("SELECT Comment_ID, Sentiment, War_Phase, Text FROM comments", conn)
    conn.close()
    
    # Filter non-spam comments
    non_spam = df_all[df_all["Sentiment"] != "Spam"]
    spam = df_all[df_all["Sentiment"] == "Spam"]
    
    total_non_spam = len(non_spam)
    target_labeled = max(10, int(total_non_spam * 0.1))
    
    print(f"Toplam spam olmayan yorum sayısı: {total_non_spam}")
    print(f"Hedeflenen etiketli yorum sayısı (%10): {target_labeled}")
    
    # We sample exactly 10% stratified by current Sentiment
    # Find labeled comments
    labeled = non_spam[non_spam["Sentiment"].isin(["Olumlu", "Olumsuz", "Nötr", "Alakasız"])]
    
    ratios = labeled["Sentiment"].value_counts(normalize=True)
    keep_list = []
    for sentiment, ratio in ratios.items():
        sub_df = labeled[labeled["Sentiment"] == sentiment]
        n_sample = max(1, int(round(ratio * target_labeled)))
        if n_sample > len(sub_df):
            n_sample = len(sub_df)
        keep_list.append(sub_df.sample(n=n_sample, random_state=42))
        
    keep_labeled = pd.concat(keep_list)
    
    if len(keep_labeled) > target_labeled:
        keep_labeled = keep_labeled.sample(n=target_labeled, random_state=42)
    elif len(keep_labeled) < target_labeled and len(labeled) > len(keep_labeled):
        remaining = labeled[~labeled["Comment_ID"].isin(keep_labeled["Comment_ID"])]
        n_needed = target_labeled - len(keep_labeled)
        additional = remaining.sample(n=min(n_needed, len(remaining)), random_state=42)
        keep_labeled = pd.concat([keep_labeled, additional])
        
    print(f"Seçilen %10 etiketli yorum sayısı: {len(keep_labeled)}")
    print(keep_labeled["Sentiment"].value_counts())
    
    keep_ids = set(keep_labeled["Comment_ID"])
    
    conn = database.get_connection()
    cursor = conn.cursor()
    
    # Set all non-selected, non-spam comments to 'Etiketsiz'
    cursor.execute("SELECT Comment_ID, Sentiment FROM comments WHERE Sentiment != 'Spam'")
    rows = cursor.fetchall()
    
    update_tuples = []
    for row in rows:
        cid = row["Comment_ID"]
        curr_sentiment = row["Sentiment"]
        if cid not in keep_ids and curr_sentiment != 'Etiketsiz':
            update_tuples.append(('Etiketsiz', cid))
            
    if update_tuples:
        print(f"{len(update_tuples)} yorumun etiketi 'Etiketsiz' olarak güncelleniyor...")
        cursor.executemany("UPDATE comments SET Sentiment = ? WHERE Comment_ID = ?", update_tuples)
        conn.commit()
    else:
        print("Güncellenecek etiket bulunamadı.")
        
    conn.close()
    
    # Update the Excel backup
    print("Excel yedeği güncelleniyor...")
    database.backup_db_to_excel()
    print("Sıfırlama işlemi başarıyla tamamlandı!")

if __name__ == "__main__":
    main()
