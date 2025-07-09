from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import pytz

# 設定台灣時區
TW_TIMEZONE = pytz.timezone('Asia/Taipei')

def get_tw_time() -> datetime:
    return datetime.now(TW_TIMEZONE)

class User(BaseModel):
    username: str
    password: str
    name: str
    department: str
    title: str
    role: str
    email: Optional[str] = None
    phone: Optional[str] = None
    status: str = "active"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_login: Optional[datetime] = None
    avatar: Optional[str] = None
    note: Optional[str] = None 

    class Config:
        json_encoders = {
            datetime: lambda dt: dt.strftime('%Y-%m-%d %H:%M:%S')
        } 