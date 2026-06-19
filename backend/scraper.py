import re
import time
import urllib.request
import urllib.parse
from youtube_comment_downloader import YoutubeCommentDownloader
import traceback
import datetime

YOUTUBE_URL_REGEX = re.compile(
    r'(https?://)?(www\.)?(youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)(?P<id>[a-zA-Z0-9_-]{11})'
)

def get_video_id(url):
    match = YOUTUBE_URL_REGEX.match(url)
    if match:
        return match.group('id')
    parsed = urllib.parse.urlparse(url)
    if parsed.netloc in ('youtube.com', 'www.youtube.com'):
        q = urllib.parse.parse_qs(parsed.query)
        if 'v' in q:
            return q['v'][0]
    return None

def get_video_title(video_id):
    url = f"https://www.youtube.com/watch?v={video_id}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
        with urllib.request.urlopen(req, timeout=10) as response:
            html = response.read().decode('utf-8')
            title_match = re.search(r'<title>(.*?)</title>', html)
            if title_match:
                title = title_match.group(1)
                if title.endswith(" - YouTube"):
                    title = title[:-10]
                return title
    except Exception as e:
        print(f"Başlık çekilemedi ({video_id}): {e}")
    return f"YouTube Video ({video_id})"

def parse_int(val, default=0):
    if not val:
        return default
    if isinstance(val, int):
        return val
    val_str = str(val).strip().lower().replace('.', '').replace(',', '.')
    try:
        if 'b' in val_str or 'k' in val_str:
            num = float(re.sub(r'[^\d.]', '', val_str))
            return int(num * 1000)
        elif 'm' in val_str:
            num = float(re.sub(r'[^\d.]', '', val_str))
            return int(num * 1000000)
        else:
            return int(re.sub(r'[^\d]', '', val_str) or default)
    except Exception:
        return default

def check_is_spam(text):
    if not text:
        return False
    text_lower = text.lower()
    
    link_patterns = [
        r'https?://\S+', 
        r'www\.\S+', 
        r'\S+\.com\b', 
        r'\S+\.net\b', 
        r'\S+\.org\b',
        r't\.me/\S+', 
        r'wa\.me/\S+', 
        r'linktr\.ee/\S+',
        r'bit\.ly/\S+'
    ]
    for pattern in link_patterns:
        if re.search(pattern, text_lower):
            return True
            
    contact_keywords = [
        "whatsapp", "telegram", "wp'den", "wpden", "bana ulaşın", 
        "iletişime geçin", "yazın", "ulaşın", "dm atın", "instagramdan",
        "t.me", "wa.me", "yatırım tavsiyesi", "forex", "kripto", "bitcoin", 
        "para kazandım", "kazanç", "finansal", "uzman", "şirket",
        "asistan", "vefat", "miras", "hisse senedi"
    ]
    for kw in contact_keywords:
        if kw in text_lower:
            return True
            
    phone_pattern = r'\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{3}[-.\s]?\d{2}[-.\s]?\d{2}'
    if re.search(phone_pattern, text_lower) and any(x in text_lower for x in ["ara", "ulaş", "yaz", "wp", "whatsapp", "bize", "iletişim", "numara"]):
        return True

    if re.search(r'(.)\1{9,}', text_lower):
        return True
        
    return False

def scrape_comments_for_video(url, phase, max_comments=0, log_callback=None):
    video_id = get_video_id(url)
    if not video_id:
        raise ValueError("Geçersiz YouTube URL'si.")

    if log_callback:
        log_callback(f"Video başlığı çekiliyor ({video_id})...")
    video_title = get_video_title(video_id)
    if log_callback:
        log_callback(f"Video başlığı: '{video_title}'")

    downloader = YoutubeCommentDownloader()
    
    if log_callback:
        log_callback("Yorumlar indirilmeye başlanıyor...")

    comment_generator = downloader.get_comments_from_url(url)
    
    scraped_count = 0
    formatted_comments = []
    
    try:
        for c in comment_generator:
            if max_comments and max_comments > 0 and scraped_count >= max_comments:
                break
            
            cid = c.get('cid')
            is_reply = 1 if c.get('reply') else 0
            
            if is_reply:
                parent_id = cid.split('.')[0] if cid and '.' in cid else None
                thread_id = parent_id
            else:
                parent_id = None
                thread_id = cid
                
            text = c.get('text')
            is_spam = check_is_spam(text)
            
            time_parsed = c.get('time_parsed')
            comment_phase = phase
            display_time = c.get('time')
            
            if time_parsed:
                try:
                    dt = datetime.datetime.fromtimestamp(float(time_parsed), datetime.timezone.utc)
                    t_start = datetime.datetime(2025, 6, 13, 0, 0, 0, tzinfo=datetime.timezone.utc)
                    t_end_war = datetime.datetime(2025, 10, 13, 23, 59, 59, tzinfo=datetime.timezone.utc)
                    t_start_post = datetime.datetime(2025, 6, 25, 0, 0, 0, tzinfo=datetime.timezone.utc)
                    
                    # Strict date filtering based on requested phase
                    if phase and phase.startswith("Savaş Öncesi"):
                        # Keep only if dt < June 13, 2025
                        if dt >= t_start:
                            continue  # Discard comment
                        comment_phase = phase
                    elif phase == "Savaş Sırası":
                        # Keep only if t_start <= dt <= t_end_war
                        if dt < t_start or dt > t_end_war:
                            continue  # Discard comment
                        comment_phase = "Savaş Sırası"
                    elif phase == "Savaş Sonrası":
                        # Keep only if dt >= t_start_post
                        if dt < t_start_post:
                            continue  # Discard comment
                        comment_phase = "Savaş Sonrası"
                    
                    # Absolute date string
                    date_str = dt.strftime("%Y-%m-%d")
                    display_time = f"{date_str} ({c.get('time')})"
                except Exception as ex:
                    print(f"Tarih ayrıştırma hatası: {ex}")
            else:
                # If no timestamp, discard it to ensure date boundary integrity
                continue
            
            # Spam kontrolü tüm aşamalar (Savaş Sonrası dahil) için aktiftir
            sentiment_val = "Spam" if is_spam else "Etiketsiz"
            
            formatted = {
                "Video_ID": video_id,
                "Video_Title": video_title,
                "Thread_ID": thread_id,
                "Comment_ID": cid,
                "Parent_Comment_ID": parent_id,
                "Is_Reply": is_reply,
                "Author_DisplayName": c.get('author'),
                "Author_ChannelId": c.get('channel'),
                "LikeCount": parse_int(c.get('votes'), 0),
                "PublishedAt": display_time,
                "UpdatedAt": display_time,
                "Text": text,
                "TotalReplyCount": parse_int(c.get('replies'), 0),
                "Sentiment": sentiment_val,
                "War_Phase": comment_phase
            }
            
            formatted_comments.append(formatted)
            scraped_count += 1
            
            if log_callback and scraped_count % 50 == 0:
                log_callback(f"{scraped_count} yorum çekildi...")
                
    except Exception as e:
        if log_callback:
            log_callback(f"Yorum kazıma sırasında hata: {e}")
        traceback.print_exc()
        
    if log_callback:
        log_callback(f"Kazıma bitti. Toplam çekilen yorum sayısı: {scraped_count}")
        
    return formatted_comments

if __name__ == "__main__":
    test_url = "https://www.youtube.com/watch?v=CG0OOQr2bbw"
    res = scrape_comments_for_video(test_url, "Savaş Öncesi", max_comments=10, log_callback=print)
    print(f"Scraped {len(res)} comments successfully.")
