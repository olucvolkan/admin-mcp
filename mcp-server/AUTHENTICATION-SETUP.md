# MCP Server Authentication Setup

## 🎯 Basit ve Etkili Yaklaşım

MCP Server, mevcut admin panel'inizin session sistemini kullanarak **minimal invaziv** authentication sağlar. Hiçbir authentication logic'i yoktur - sadece session cookie'leri target API'lere forward eder.

## 🔧 Nasıl Çalışır

### 1. Session Cookie Forward Sistemi
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Admin Panel   │    │   MCP Server    │    │   Target API    │
│                 │    │                 │    │                 │
│ 1. User Login   │───▶│ 2. Extract      │───▶│ 3. Validate     │
│    (Session)    │    │    Session      │    │    Session      │
│                 │    │    Cookie       │    │    & Execute    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 2. Temel Akış
1. **Kullanıcı admin panelde login olur** → Session cookie alır
2. **Chatbot'a mesaj yazar**: "Yeni kullanıcı ekle"
3. **MCP Server**: Session cookie'yi alır ve API'ye forward eder
4. **Target API**: Session'ı validate eder ve işlemi yapar
5. **Sonuç**: 200 (başarılı) veya 401/403 (yetkisiz)

## ⚙️ Kurulum

### Environment Variables
```env
# Session cookie adı (admin panelinizde kullandığınız)
SESSION_COOKIE_NAME=session

# Cookie güvenliği için secret (opsiyonel)
COOKIE_SECRET=your-secret-here

# Port (opsiyonel, default: 3000)
PORT=3000
```

### Örnek Docker Compose
```yaml
version: '3.8'
services:
  mcp-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - SESSION_COOKIE_NAME=admin_session
      - DATABASE_URL=postgresql://user:pass@db:5432/mcp
      - OPENAI_API_KEY=your_openai_key
    depends_on:
      - db
```

## 🌐 CORS Konfigürasyonu

MCP Server, admin panelinizle aynı domain'de çalışması için CORS'u otomatik handle eder:

```javascript
// Otomatik CORS ayarları
app.enableCors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
});
```

## 🔌 Entegrasyon Örnekleri

### 1. React Admin Panel Entegrasyonu
```javascript
// Admin panelinizdeki chat component
const ChatBot = () => {
  const sendMessage = async (message) => {
    const response = await fetch('/api/mcp/chat', {
      method: 'POST',
      credentials: 'include', // Session cookie'yi gönder
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId: 1,
        message: message
      })
    });
    
    return response.json();
  };
};
```

### 2. WebSocket Entegrasyonu
```javascript
// WebSocket connection with session
const socket = io('ws://localhost:3000', {
  withCredentials: true // Session cookie'yi gönder
});

socket.on('connect', () => {
  console.log('Connected to MCP Server');
});

socket.emit('chat_query', {
  projectId: 1,
  message: 'Kullanıcıları listele'
});

socket.on('chat_update', (update) => {
  console.log('Chat update:', update);
});
```

### 3. Nginx Proxy Konfigürasyonu
```nginx
# Admin panel ve MCP Server aynı domain'de
server {
    listen 80;
    server_name admin.example.com;

    # Admin panel
    location / {
        proxy_pass http://admin-panel:3000;
        proxy_set_header Cookie $http_cookie;
    }

    # MCP Server
    location /api/mcp/ {
        proxy_pass http://mcp-server:3000/;
        proxy_set_header Cookie $http_cookie;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://mcp-server:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Cookie $http_cookie;
    }
}
```

## 🧪 Test Etme

### 1. Session Cookie Test
```bash
# Session cookie ile API çağrısı
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: session=your_session_value" \
  -d '{
    "projectId": 1,
    "message": "Kullanıcıları listele"
  }'
```

### 2. Session Olmadan Test
```bash
# Session olmadan - API 401 dönmeli
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "message": "Kullanıcıları listele"
  }'
```

## 📋 API Endpoints

### Chat Endpoints
```
POST   /chat                    # Natural language query
GET    /chat/search/:projectId  # Chat history
GET    /chat/session/:projectId # Session bilgisi
DELETE /chat/cache/:projectId   # Cache temizle
POST   /chat/:projectId/test    # Test queries
```

### WebSocket Events
```
chat_query       # Query gönder
chat_update      # Gerçek zamanlı güncellemeler
get_chat_history # Chat geçmişi
clear_cache      # Cache temizle
ping/pong        # Connection test
```

## 🛡️ Güvenlik

### 1. Session Güvenliği
- **MCP Server hiçbir authentication yapmaz**
- **Target API'ler session'ı validate eder**
- **Session cookie'ler HttpOnly olmalı**
- **HTTPS kullanın (production'da)**

### 2. CORS Güvenliği
- **Development'ta origin: true**
- **Production'da specific domain'ler**
- **credentials: true her zaman**

### 3. Rate Limiting (Opsiyonel)
```javascript
// Nginx'te rate limiting
location /api/mcp/ {
    limit_req zone=mcp burst=10 nodelay;
    proxy_pass http://mcp-server:3000/;
}
```

## 🚀 Production Deployment

### 1. Environment Variables
```env
NODE_ENV=production
SESSION_COOKIE_NAME=admin_session
COOKIE_SECRET=strong-random-secret
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
```

### 2. Docker Production
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### 3. Health Check
```bash
# Health check endpoint
curl http://localhost:3000/health
```

## ❓ Troubleshooting

### Session Cookie Görünmüyor
```bash
# Browser'da cookie'leri kontrol edin
document.cookie

# Network tab'da cookie header'ını kontrol edin
```

### CORS Hatası
```javascript
// Fetch'te credentials eklemeyi unutmayın
fetch('/api/mcp/chat', {
  credentials: 'include' // Bu önemli!
});
```

### WebSocket Bağlantı Sorunu
```javascript
// WebSocket'te withCredentials kullanın
const socket = io('ws://localhost:3000', {
  withCredentials: true
});
```

## 📞 Destek

Bu basit yaklaşım ile:
- ✅ Mevcut authentication sisteminizi bozmaz
- ✅ Minimal kod değişikliği gerektirir  
- ✅ Session güvenliği korunur
- ✅ Kullanıcı yetkileri API'de kontrol edilir
- ✅ Stateless ve scalable'dır

Sorun yaşarsanız, session cookie name'ini ve CORS ayarlarını kontrol edin. 