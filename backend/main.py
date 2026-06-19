import io
import os
import uvicorn
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from contextlib import asynccontextmanager
import database # type: ignore

@asynccontextmanager
async def lifespan(app: FastAPI):
    database.init_db()
    yield

app = FastAPI(title="YouTube Yorum Duygu Analizi API", lifespan=lifespan)

# Configure CORS so React (usually port 5173) can talk to FastAPI (usually port 8000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In development, allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Scraping status tracking
scrape_status = {
    "running": False,
    "progress": "",
    "logs": []
}

class ScrapeRequest(BaseModel):
    url: str
    phase: str
    max_comments: int = 0

class UpdateSentimentRequest(BaseModel):
    comment_id: str
    sentiment: str

class TestRequest(BaseModel):
    text: str

def add_log(msg):
    print(msg)
    scrape_status["logs"].append(msg)
    scrape_status["progress"] = msg
    if len(scrape_status["logs"]) > 100:
        scrape_status["logs"].pop(0)

def bg_scrape_task(url, phase, max_comments):
    global scrape_status
    scrape_status["running"] = True
    scrape_status["logs"] = []
    add_log(f"Kazıma görevi başladı. URL: {url}, Aşama: {phase}")
    
    try:
        import scraper # type: ignore
        comments = scraper.scrape_comments_for_video(
            url, phase, max_comments=max_comments, log_callback=add_log
        )
        if comments:
            add_log(f"{len(comments)} yorum veritabanına ekleniyor...")
            inserted, updated = database.insert_comments(comments)
            add_log(f"Tamamlandı. Yeni eklenen: {inserted}, Güncellenen/Aynı: {updated}")
        else:
            add_log("Hiç yorum çekilemedi.")
    except Exception as e:
        add_log(f"Grup kazıma sırasında beklenmeyen hata: {str(e)}")
    finally:
        scrape_status["running"] = False



@app.get("/api/status")
def get_scrape_status():
    return scrape_status

@app.post("/api/scrape")
def trigger_scrape(req: ScrapeRequest, background_tasks: BackgroundTasks):
    if scrape_status["running"]:
        raise HTTPException(status_code=400, detail="Zaten aktif bir kazıma işlemi çalışıyor.")
    
    background_tasks.add_task(bg_scrape_task, req.url, req.phase, req.max_comments)
    return {"message": "Kazıma işlemi arka planda başlatıldı."}

@app.get("/api/comments")
def get_comments(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    search: str = Query("", description="Yorum metni arama"),
    phase: str = Query("", description="Savaş Aşaması filtresi"),
    sentiment: str = Query("", description="Duygu filtresi")
):
    try:
        comments, total = database.get_comments(page, limit, search, phase, sentiment)
        return {
            "comments": comments,
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Yorumlar alınırken hata oluştu: {str(e)}")

@app.post("/api/comments/update")
def update_comment_sentiment(req: UpdateSentimentRequest):
    if req.sentiment not in ["Olumlu", "Olumsuz", "Nötr", "Alakasız", "Etiketsiz", "Spam"]:
        raise HTTPException(status_code=400, detail="Geçersiz duygu etiketi.")
    
    success = database.update_sentiment(req.comment_id, req.sentiment)
    if not success:
        raise HTTPException(status_code=404, detail="Yorum bulunamadı.")
    
    return {"message": "Yorum duygu etiketi başarıyla güncellendi."}

@app.post("/api/train")
def train_model():
    try:
        import classifier # type: ignore
        result = classifier.train_model()
        if result.get("success"):
            labeled_count = classifier.auto_label_unlabeled()
            result["auto_labeled_count"] = labeled_count
            result["message"] += f" Kalan {labeled_count} adet etiketsiz yorum model ile otomatik etiketlendi."
        return result
    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        print(f"Train model error: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Model training error: {str(e)}")

@app.post("/api/auto-label")
def auto_label():
    import classifier # type: ignore
    labeled_count = classifier.auto_label_unlabeled()
    return {"message": f"Eğitilmiş model ile {labeled_count} etiketsiz yorum otomatik etiketlendi."}

@app.post("/api/test-predict")
def test_predict(req: TestRequest):
    import classifier # type: ignore
    pred, confidence = classifier.predict_sentiment(req.text)
    return {"sentiment": pred, "confidence": confidence}

@app.get("/api/stats")
def get_stats():
    return database.get_sentiment_stats()

@app.get("/api/export")
def export_excel():
    try:
        import pandas as pd
        comments = database.get_all_comments_for_export()
        if not comments:
            # Return an empty dataframe with correct headers
            df_export = pd.DataFrame(columns=[
                "Video_ID", "Video_Title", "Thread_ID", "Comment_ID", "Parent_Comment_ID",
                "Is_Reply", "Author_DisplayName", "Author_ChannelId", "LikeCount",
                "PublishedAt", "UpdatedAt", "Text", "TotalReplyCount", "Sentiment", "War_Phase"
            ])
        else:
            df = pd.DataFrame(comments)
            
            # Map column names to the exact required headers
            columns_order = [
                "Video_ID", "Video_Title", "Thread_ID", "Comment_ID", "Parent_Comment_ID",
                "Is_Reply", "Author_DisplayName", "Author_ChannelId", "LikeCount",
                "PublishedAt", "UpdatedAt", "Text", "TotalReplyCount", "Sentiment", "War_Phase"
            ]
            
            # Select and order columns
            df_export = df[columns_order]
            
        # Write to memory stream
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df_export.to_excel(writer, index=False, sheet_name='Yorum Analizi')
        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=youtube_war_comments_sentiment.xlsx"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel dışa aktarma hatası: {str(e)}")

@app.get("/api/videos")
def get_videos():
    try:
        return database.get_scraped_videos()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/videos/{video_id}/spam")
def get_video_spam(video_id: str):
    try:
        comments = database.get_spam_comments(video_id)
        return {"comments": comments}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/videos/{video_id}")
def delete_video(video_id: str):
    try:
        deleted = database.delete_video_comments(video_id)
        return {"message": f"{deleted} yorum başarıyla silindi.", "deleted_count": deleted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/import-excel")
async def import_excel(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Sadece .xlsx dosyaları kabul edilir.")
    try:
        import pandas as pd
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        df = df.where(pd.notnull(df), None)

        required_cols = {"Comment_ID", "Text", "Sentiment", "War_Phase"}
        missing = required_cols - set(df.columns)
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Eksik sütunlar: {', '.join(missing)}"
            )

        comments_list = df.to_dict(orient="records")
        inserted, updated = database.insert_comments(comments_list, trigger_backup_after=False)
        return {
            "message": f"İçe aktarma tamamlandı.",
            "inserted": inserted,
            "updated": updated,
            "total": len(comments_list)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dosya işlenirken hata: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
