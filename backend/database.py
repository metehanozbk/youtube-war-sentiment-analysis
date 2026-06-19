import sqlite3
import os
import threading

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "comments.db")
EXCEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "youtube_war_comments_sentiment.xlsx")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def backup_db_to_excel():
    try:
        import pandas as pd
        comments = get_all_comments_for_export()
        if comments:
            df = pd.DataFrame(comments)
            columns_order = [
                "Video_ID", "Video_Title", "Thread_ID", "Comment_ID", "Parent_Comment_ID",
                "Is_Reply", "Author_DisplayName", "Author_ChannelId", "LikeCount",
                "PublishedAt", "UpdatedAt", "Text", "TotalReplyCount", "Sentiment", "War_Phase"
            ]
            df_export = df[columns_order]
            df_export.to_excel(EXCEL_PATH, index=False, sheet_name='Yorum Analizi')
            print(f"[YEDEK] Veritabanı Excel dosyasına başarıyla yedeklendi: {EXCEL_PATH}")
    except Exception as e:
        print(f"[HATA] Excel yedekleme hatası: {e}")

def _backup_worker():
    backup_db_to_excel()

def trigger_backup():
    threading.Thread(target=_backup_worker, daemon=True).start()

def import_excel_to_db():
    if not os.path.exists(EXCEL_PATH):
        print(f"[UYARI] Yedek Excel dosyası bulunamadı, aktarım atlandı: {EXCEL_PATH}")
        return
        
    try:
        import pandas as pd
        print("[AKTARIM] Excel dosyasından veriler veritabanına yükleniyor...")
        df = pd.read_excel(EXCEL_PATH)
        
        # Replace NaN with None
        df = df.where(pd.notnull(df), None)
        
        # Convert dataframe to list of dicts
        comments_list = df.to_dict(orient="records")
        
        if comments_list:
            inserted, updated = insert_comments(comments_list, trigger_backup_after=False)
            print(f"[AKTARIM] Excel aktarımı tamamlandı. Yeni eklenen: {inserted}, Güncellenen/Aynı: {updated}")
    except Exception as e:
        print(f"[HATA] Excel'den aktarma sırasında hata oluştu: {e}")

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS comments (
            Video_ID TEXT,
            Video_Title TEXT,
            Thread_ID TEXT,
            Comment_ID TEXT PRIMARY KEY,
            Parent_Comment_ID TEXT,
            Is_Reply INTEGER,
            Author_DisplayName TEXT,
            Author_ChannelId TEXT,
            LikeCount INTEGER,
            PublishedAt TEXT,
            UpdatedAt TEXT,
            Text TEXT,
            TotalReplyCount INTEGER,
            Sentiment TEXT DEFAULT 'Etiketsiz',
            War_Phase TEXT
        )
    """)
    conn.commit()
    
    # Check if comments table is empty to auto-import
    cursor.execute("SELECT COUNT(*) FROM comments")
    count = cursor.fetchone()[0]
    conn.close()
    
    print("Veritabanı başarıyla başlatıldı.")
    
    if count == 0:
        import_excel_to_db()

def insert_comments(comments_list, trigger_backup_after=True):
    import re
    import datetime

    conn = get_connection()
    cursor = conn.cursor()
    inserted = 0
    updated = 0
    for comment in comments_list:
        phase = comment.get("War_Phase")
        pub_at = comment.get("PublishedAt")
        if phase == "Savaş Sonrası" and pub_at:
            match = re.match(r'^(\d{4}-\d{2}-\d{2})', str(pub_at))
            if match:
                date_str = match.group(1)
                try:
                    dt = datetime.datetime.strptime(date_str, "%Y-%m-%d")
                    cutoff = datetime.datetime(2025, 6, 25)
                    if dt < cutoff:
                        continue
                except Exception:
                    pass

        try:
            cursor.execute("""
                INSERT INTO comments (
                    Video_ID, Video_Title, Thread_ID, Comment_ID, Parent_Comment_ID,
                    Is_Reply, Author_DisplayName, Author_ChannelId, LikeCount,
                    PublishedAt, UpdatedAt, Text, TotalReplyCount, Sentiment, War_Phase
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(Comment_ID) DO UPDATE SET
                    LikeCount = excluded.LikeCount,
                    UpdatedAt = excluded.UpdatedAt,
                    Text = excluded.Text,
                    TotalReplyCount = excluded.TotalReplyCount,
                    PublishedAt = excluded.PublishedAt,
                    War_Phase = excluded.War_Phase
            """, (
                comment.get("Video_ID"),
                comment.get("Video_Title"),
                comment.get("Thread_ID"),
                comment.get("Comment_ID"),
                comment.get("Parent_Comment_ID"),
                1 if comment.get("Is_Reply") else 0,
                comment.get("Author_DisplayName"),
                comment.get("Author_ChannelId"),
                comment.get("LikeCount", 0),
                comment.get("PublishedAt"),
                comment.get("UpdatedAt"),
                comment.get("Text"),
                comment.get("TotalReplyCount", 0),
                comment.get("Sentiment", "Etiketsiz"),
                comment.get("War_Phase")
            ))
            if cursor.rowcount > 0:
                inserted += 1
            else:
                updated += 1
        except Exception as e:
            print(f"Hata oluştu (Yorum ID: {comment.get('Comment_ID')}): {e}")
    conn.commit()
    conn.close()
    if trigger_backup_after:
        trigger_backup()
    return inserted, updated

def get_comments(page=1, limit=50, search="", phase="", sentiment=""):
    conn = get_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM comments WHERE Sentiment != 'Spam'"
    params = []
    
    if search:
        query += " AND Text LIKE ?"
        params.append(f"%{search}%")
    if phase:
        query += " AND War_Phase = ?"
        params.append(phase)
    if sentiment:
        query += " AND Sentiment = ?"
        params.append(sentiment)
        
    # Count total
    count_query = query.replace("SELECT *", "SELECT COUNT(*)")
    cursor.execute(count_query, params)
    total = cursor.fetchone()[0]
    
    # Pagination
    query += " ORDER BY LikeCount DESC, PublishedAt DESC LIMIT ? OFFSET ?"
    params.extend([limit, (page - 1) * limit])
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    comments = [dict(row) for row in rows]
    conn.close()
    
    return comments, total

def update_sentiment(comment_id, sentiment):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE comments SET Sentiment = ? WHERE Comment_ID = ?", (sentiment, comment_id))
    conn.commit()
    success = cursor.rowcount > 0
    conn.close()
    if success:
        trigger_backup()
    return success

def get_all_comments_for_export():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM comments WHERE Sentiment != 'Spam' ORDER BY War_Phase, LikeCount DESC")
    rows = cursor.fetchall()
    comments = [dict(row) for row in rows]
    conn.close()
    return comments

def get_spam_comments(video_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM comments WHERE Video_ID = ? AND Sentiment = 'Spam' ORDER BY LikeCount DESC, PublishedAt DESC", (video_id,))
    rows = cursor.fetchall()
    comments = [dict(row) for row in rows]
    conn.close()
    return comments


def get_sentiment_stats():
    conn = get_connection()
    cursor = conn.cursor()
    # General stats
    cursor.execute("SELECT Sentiment, COUNT(*) as count FROM comments GROUP BY Sentiment")
    general = {row['Sentiment']: row['count'] for row in cursor.fetchall()}
    
    # Stats by phase
    cursor.execute("SELECT War_Phase, Sentiment, COUNT(*) as count FROM comments GROUP BY War_Phase, Sentiment")
    by_phase = {}
    for row in cursor.fetchall():
        phase = row['War_Phase']
        sentiment = row['Sentiment']
        count = row['count']
        if phase not in by_phase:
            by_phase[phase] = {}
        by_phase[phase][sentiment] = count
        
    conn.close()
    return {"general": general, "by_phase": by_phase}

def delete_video_comments(video_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM comments WHERE Video_ID = ?", (video_id,))
    conn.commit()
    deleted_count = cursor.rowcount
    conn.close()
    if deleted_count > 0:
        trigger_backup()
    return deleted_count

def get_scraped_videos():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT Video_ID, MAX(Video_Title) as Video_Title, 
               CASE 
                   WHEN Video_ID = 'CG0OOQr2bbw' THEN 'Savaş Öncesi 1'
                   WHEN Video_ID = '83Gxpdw6U5Y' THEN 'Savaş Öncesi 2'
                   WHEN Video_ID = '5OBgBQVNFJM' THEN 'Savaş Sırası'
                   WHEN Video_ID = 'zdi4S4Rguu4' THEN 'Savaş Sonrası'
                   ELSE MAX(War_Phase)
               END as War_Phase,
               COUNT(*) as comment_count 
        FROM comments 
        WHERE Video_ID IS NOT NULL AND Video_ID != ''
        GROUP BY Video_ID
    """)
    rows = cursor.fetchall()
    videos = [dict(row) for row in rows]
    conn.close()
    return videos

if __name__ == "__main__":
    init_db()
