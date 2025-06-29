# MCP Server WebSocket Guide 🚀

## Real-time Natural Language to API Orchestration

MCP Server artık WebSocket desteği ile gerçek zamanlı chat deneyimi sunuyor! Her adım sonrasında kullanıcıya anlık geri bildirim veren bu sistem, doğal dil ile API çağrılarını çok daha hızlı ve etkileşimli hale getiriyor.

## 🌟 Yeni Özellikler

### Real-time Communication
- **WebSocket bağlantısı** üzerinden anlık iletişim
- **Her adım için progress update** - Plan oluşturma, API çağrıları, formatlamainfotest
- **Progress bar** ile görsel ilerleme takibi
- **Typing indicator** ile işleme durumu göstergesi

### Streaming Updates
```typescript
// Her adım için real-time güncellemeler
{
  type: 'planning' | 'executing' | 'step_completed' | 'formatting' | 'completed' | 'error',
  step?: number,
  totalSteps?: number,
  message: string,
  progress?: number, // 0-100
  timestamp: string
}
```

### Chat History & Context
- **Kullanıcı oturumları** için chat geçmişi
- **Bağlamsal sorgular** - önceki yanıtları kullanma
- **Cache optimizasyonu** ile daha hızlı yanıtlar

## 🚀 Hızlı Başlangıç

### 1. Sunucuyu Başlatın
```bash
cd mcp-server
npm install
npm run start:dev
```

### 2. WebSocket Endpointleri
- **HTTP API**: http://localhost:3000
- **WebSocket Chat**: ws://localhost:8001/chat
- **Swagger UI**: http://localhost:3000/api-docs
- **Chat Client**: http://localhost:3000/chat-client.html

### 3. Client Bağlantısı
```javascript
// Socket.IO client
const socket = io('ws://localhost:8001/chat');

// Kimlik doğrulama
socket.emit('authenticate', {
  projectId: 1,
  userId: 'user123',
  authToken: 'bearer-token'
});

// Mesaj gönderme
socket.emit('chat_message', {
  projectId: 1,
  message: 'Get all users',
  authToken: 'optional-token',
  userId: 'user123'
});
```

## 📡 WebSocket Events

### Client → Server Events

#### `authenticate`
```typescript
{
  projectId: number;
  userId?: string;
  authToken?: string;
}
```

#### `chat_message`
```typescript
{
  projectId: number;
  message: string;
  authToken?: string;
  userId?: string;
}
```

#### `get_chat_history`
```typescript
{
  projectId: number;
  userId?: string;
  limit?: number; // default: 20
}
```

#### `clear_cache`
```typescript
{
  projectId: number;
  userId?: string;
}
```

### Server → Client Events

#### `connected`
```typescript
{
  clientId: string;
  message: string;
  timestamp: string;
}
```

#### `authenticated`
```typescript
{
  success: boolean;
  userId?: string;
  projectId?: number;
  message: string;
}
```

#### `message_received`
```typescript
{
  messageId: string;
  status: 'processing';
  timestamp: string;
}
```

#### `chat_update` (Real-time Progress)
```typescript
{
  type: 'planning' | 'executing' | 'step_completed' | 'formatting' | 'completed' | 'error';
  step?: number;
  totalSteps?: number;
  message: string;
  data?: any;
  timestamp: string;
  executionTime?: number;
  progress?: number; // 0-100
}
```

#### `chat_error`
```typescript
{
  error: string;
  message: string;
  timestamp: string;
}
```

## 🎯 Real-time Workflow Örneği

### 1. Kullanıcı Sorgusu
```
User: "Get user john_doe and show me his orders"
```

### 2. Streaming Updates
```typescript
// 1. Plan oluşturma başladı
{
  type: 'planning',
  message: 'Analyzing your request...',
  progress: 10,
  timestamp: '2024-01-15T10:30:00.000Z'
}

// 2. Plan oluşturuldu
{
  type: 'planning',
  message: 'Plan created with 2 steps',
  progress: 40,
  totalSteps: 2,
  timestamp: '2024-01-15T10:30:01.500Z'
}

// 3. İlk API çağrısı
{
  type: 'step_completed',
  step: 1,
  totalSteps: 2,
  message: 'Completed step 1: GET /users/john_doe',
  progress: 60,
  timestamp: '2024-01-15T10:30:02.800Z'
}

// 4. İkinci API çağrısı
{
  type: 'step_completed',
  step: 2,
  totalSteps: 2,
  message: 'Completed step 2: GET /orders',
  progress: 80,
  timestamp: '2024-01-15T10:30:03.200Z'
}

// 5. Formatlanıyor
{
  type: 'formatting',
  message: 'Formatting response...',
  progress: 85,
  timestamp: '2024-01-15T10:30:03.500Z'
}

// 6. Tamamlandı
{
  type: 'completed',
  message: 'Found user john_doe and 3 orders',
  data: { user: {...}, orders: [...] },
  progress: 100,
  executionTime: 3500,
  timestamp: '2024-01-15T10:30:04.000Z'
}
```

## 🖥️ HTML Client Kullanımı

### Demo Client
`http://localhost:3000/chat-client.html` adresinde hazır bir demo client bulunuyor:

**Özellikler:**
- ✅ Responsive tasarım
- ✅ Real-time progress göstergesi  
- ✅ Typing indicator
- ✅ Mesaj geçmişi
- ✅ Örnek sorgular
- ✅ Bağlantı durumu göstergesi
- ✅ Otomatik scroll
- ✅ Güzel UI/UX

### Kendi Client'ınızı Oluşturun
```html
<!DOCTYPE html>
<html>
<head>
    <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
</head>
<body>
    <script>
        const socket = io('ws://localhost:8001/chat');
        
        socket.on('connect', () => {
            console.log('Connected to MCP Server!');
            
            // Kimlik doğrulama
            socket.emit('authenticate', {
                projectId: 1,
                userId: 'demo-user'
            });
        });
        
        socket.on('chat_update', (update) => {
            console.log('Progress:', update);
            updateUI(update);
        });
        
        function sendMessage(message) {
            socket.emit('chat_message', {
                projectId: 1,
                message: message,
                userId: 'demo-user'
            });
        }
    </script>
</body>
</html>
```

## 📊 Performance Karşılaştırması

### HTTP vs WebSocket

| Özellik | HTTP API | WebSocket |
|---------|----------|-----------|
| **İlk Yanıt** | 3-5 saniye | 100ms (planning start) |
| **Progress Tracking** | ❌ | ✅ Real-time |
| **User Experience** | Statik bekleme | Dinamik progress |
| **Error Handling** | Son durumda | Her adımda |
| **Context Aware** | ✅ (cache) | ✅ (gelişmiş) |
| **Retry Logic** | ✅ | ✅ (görünür) |

### Örnek Sorgular
```javascript
// Basit sorgular
"Get all users"
"Find available pets"
"Show me inventory status"

// Kompleks sorgular  
"Get user john_doe and show me his orders"
"Create a new user with email test@example.com then place an order"
"Find all products in Electronics category and check inventory"

// Bağlamsal sorgular
"Show me more details" // Önceki sonucu referans alır
"What about his recent orders?" // User context'i kullanır
```

## 🔧 Geliştirici Notları

### Chat Service Streaming
```typescript
// Chat service streaming metodu
async processQueryStream(
  request: ChatRequest,
  updateCallback: (update: ChatStreamUpdate) => void
): Promise<void> {
  // Her adım için callback çağırılır
  updateCallback({
    type: 'planning',
    message: 'Creating execution plan...',
    progress: 30
  });
}
```

### Cache Integration
```typescript
// Chat history ve context cache
storeChatHistory(sessionId: string, request: ChatRequest, response: ChatResponse): void
getChatHistory(projectId: number, userId?: string, limit: number = 20): ChatHistoryItem[]
clearUserCache(projectId: number, userId?: string): void
```

### Gateway Configuration
```typescript
@WebSocketGateway(8001, {
  cors: { origin: '*' },
  namespace: '/chat',
})
export class ChatGateway {
  // Real-time chat handling
}
```

## 🚀 Production Deployment

### Environment Variables
```bash
# .env
DATABASE_URL=postgresql://user:pass@localhost:5432/mcp_db
OPENAI_API_KEY=your_openai_api_key
NODE_ENV=production
PORT=3000
```

### Docker Deployment
```dockerfile
# Port mapping için
EXPOSE 3000 8001

# WebSocket ve HTTP port'ları
```

### Nginx Configuration
```nginx
# HTTP API
location / {
    proxy_pass http://localhost:3000;
}

# WebSocket
location /socket.io/ {
    proxy_pass http://localhost:8001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## 🎯 Best Practices

### Client Side
- **Bağlantı durumunu** sürekli kontrol edin
- **Error handling** için retry logic ekleyin  
- **Progress updates** ile user experience geliştirin
- **Chat history** ile context koruyun

### Server Side
- **Rate limiting** ekleyin (production)
- **Authentication** mechaizmaları güçlendirin
- **Logging** ve monitoring ekleyin
- **Error boundaries** tanımlayın

## 🤝 Migration Guide

### HTTP'den WebSocket'e Geçiş
```typescript
// Eski HTTP yaklaşımı
const response = await fetch('/chat', {
  method: 'POST',
  body: JSON.stringify({ message: 'Get users' })
});

// Yeni WebSocket yaklaşımı  
socket.emit('chat_message', { message: 'Get users' });
socket.on('chat_update', (update) => {
  // Real-time progress
});
```

Bu rehberle MCP Server'ınızı modern, real-time bir chatbot deneyimine dönüştürebilirsiniz! 🚀 