# Socket.io Chat Application Guide

## Architecture Overview

```mermaid
flowchart LR
    subgraph Client["Client (Next.js - Port 3000)"]
        React[React Components]
        SocketClient[socket.io-client]
    end

    subgraph Server["Server (Express - Port 8080)"]
        Express[Express App]
        SocketServer[Socket.io Server]
    end

    SocketClient -->|WebSocket| SocketServer
    SocketServer -->|Events| SocketClient
```

---

## 1. Socket Connection Flow

### How WebSocket Differs from HTTP

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    Note over C,S: Traditional HTTP
    C->>S: HTTP Request
    S->>C: HTTP Response
    Note over C,S: Connection Closed

    Note over C,S: WebSocket
    C->>S: HTTP Upgrade Request
    S->>C: 101 Switching Protocols
    Note over C,S: Persistent Bi-directional Connection
```

### Connection Lifecycle

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    C->>S: io("http://localhost:8080")
    C->>S: HTTP Upgrade Request (WebSocket Handshake)
    S->>C: HTTP 101 Switching Protocols

    Note over C,S: WebSocket Connection Established

    S->>C: "connect" event
    Note over C: setIsConnected(true)
    Note over S: io.on("connection") fires

    C--xS: Connection lost
    S->>C: "disconnect" event
    Note over C: setIsConnected(false)
```

### Client Connection Code

```typescript
// socket.ts
import { io } from "socket.io-client";

const URL = "http://localhost:8080";
export const socket = io(URL);
```

```typescript
// page.tsx - Connection handling
useEffect(() => {
  function onConnect() {
    setIsConnected(true); // Update UI state
  }

  function onDisconnect() {
    setIsConnected(false);
  }

  socket.on("connect", onConnect);
  socket.on("disconnect", onDisconnect);

  return () => {
    socket.off("connect", onConnect);
    socket.off("disconnect", onDisconnect);
  };
}, []);
```

### Server Connection Code

```typescript
// server.ts
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});
```

---

## 2. Chat Message Flow

```mermaid
sequenceDiagram
    participant A as Client A
    participant S as Server
    participant B as Client B
    participant C as Client C

    Note over A: User types "Hello" and clicks Send

    A->>S: emit("chat message", "Hello")

    Note over S: socket.broadcast.emit()

    S->>B: "chat message", "Hello"
    S->>C: "chat message", "Hello"

    Note over B: Message appears in UI
    Note over C: Message appears in UI
    Note over A: Message NOT sent back to sender
```

### Emit Methods Comparison

```mermaid
flowchart TB
    subgraph emit["socket.emit()"]
        direction LR
        A1[Client] -->|message| S1[Server Only]
    end

    subgraph broadcast["socket.broadcast.emit()"]
        direction LR
        S2[Server] -->|message| B2[Client B]
        S2 -->|message| C2[Client C]
        S2 -.->|NOT sent| A2[Client A - Sender]
    end

    subgraph ioEmit["io.emit()"]
        direction LR
        S3[Server] -->|message| A3[Client A]
        S3 -->|message| B3[Client B]
        S3 -->|message| C3[Client C]
    end
```

| Method                    | Description                       |
| ------------------------- | --------------------------------- |
| `socket.emit()`           | Send to the server only           |
| `socket.broadcast.emit()` | Send to all clients EXCEPT sender |
| `io.emit()`               | Send to ALL connected clients     |

---

## 3. Typing Indicator Flow

### State Management

```typescript
// Client state
const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
```

### Complete Flow

```mermaid
sequenceDiagram
    participant A as Client A
    participant S as Server
    participant B as Client B

    Note over A: User presses a key
    Note over A: handleTyping() called

    A->>S: emit("typing", true)
    Note over A: Start 1s timeout

    S->>B: broadcast("typing", {userId, isTyping: true})
    Note over B: typingUsers.add(userId)
    Note over B: Shows "Someone is typing..."

    Note over A: User presses another key
    Note over A: Clear previous timeout
    Note over A: Start NEW 1s timeout

    A->>S: emit("typing", true)
    S->>B: broadcast("typing", {userId, isTyping: true})

    Note over A: 1 second passes with no keystrokes...
    Note over A: Timeout fires!

    A->>S: emit("typing", false)
    S->>B: broadcast("typing", {userId, isTyping: false})

    Note over B: typingUsers.delete(userId)
    Note over B: Hides typing indicator
```

### Debouncing Logic

```mermaid
timeline
    title Typing Debounce Timeline
    0ms : User presses H : emit typing true : Start timeout 1
    200ms : User presses e : emit typing true : Cancel timeout 1, Start timeout 2
    400ms : User presses y : emit typing true : Cancel timeout 2, Start timeout 3
    1400ms : Timeout fires : emit typing false
```

```mermaid
flowchart TD
    A[User presses key] --> B[emit 'typing: true']
    B --> C{Existing timeout?}
    C -->|Yes| D[Clear timeout]
    C -->|No| E[Start 1s timeout]
    D --> E
    E --> F{Key pressed within 1s?}
    F -->|Yes| A
    F -->|No| G[Timeout fires]
    G --> H[emit 'typing: false']
```

### Client Code

```typescript
const handleTyping = () => {
  // Tell server we're typing
  socket.emit("typing", true);

  // Clear any existing timeout
  if (typingTimeoutRef.current) {
    clearTimeout(typingTimeoutRef.current);
  }

  // Set new timeout - will fire if no keystroke for 1 second
  typingTimeoutRef.current = setTimeout(() => {
    socket.emit("typing", false);
  }, 1000);
};

// Listen for typing events from others
function onTyping({ userId, isTyping }: { userId: string; isTyping: boolean }) {
  setTypingUsers((prev) => {
    const next = new Set(prev);
    if (isTyping) {
      next.add(userId);
    } else {
      next.delete(userId);
    }
    return next;
  });
}
```

### Server Code

```typescript
socket.on("typing", (isTyping: boolean) => {
  // Forward typing status to all OTHER clients
  socket.broadcast.emit("typing", {
    userId: socket.id,
    isTyping,
  });
});
```

---

## 4. Complete Event Flow

```mermaid
flowchart TB
    subgraph Client
        UI[Chat UI]
        Handlers[Event Handlers]
        Socket[socket.io-client]
    end

    subgraph Server
        IO[Socket.io Server]
        Express[Express App]
    end

    UI -->|onChange| Handlers
    Handlers -->|emit| Socket
    Socket -->|send| IO
    IO -->|broadcast| Socket
    Socket -->|on event| Handlers
    Handlers -->|setState| UI
```

## 5. Event Summary

```mermaid
flowchart LR
    subgraph Events
        direction TB
        E1[connect]
        E2[disconnect]
        E3[chat message]
        E4[typing]
    end

    subgraph Payloads
        direction TB
        P1["-"]
        P2["-"]
        P3["string"]
        P4["boolean / {userId, isTyping}"]
    end

    E1 --- P1
    E2 --- P2
    E3 --- P3
    E4 --- P4
```

| Event          | Direction                | Payload              | Purpose                        |
| -------------- | ------------------------ | -------------------- | ------------------------------ |
| `connect`      | Server → Client          | -                    | Connection established         |
| `disconnect`   | Server → Client          | -                    | Connection lost                |
| `chat message` | Client → Server → Others | `string`             | Send a chat message            |
| `typing`       | Client → Server          | `boolean`            | User started/stopped typing    |
| `typing`       | Server → Others          | `{userId, isTyping}` | Notify others of typing status |

---

## 6. File Structure

```mermaid
flowchart TB
    subgraph socket-test
        subgraph server
            S1[src/server.ts]
            S2[package.json]
            S3[tsconfig.json]
        end

        subgraph client
            C1[app/page.tsx]
            C2[app/layout.tsx]
            C3[socket.ts]
            C4[package.json]
        end
    end

    C3 -->|connects to| S1
```

---

## 7. Running the Application

```bash
# Terminal 1 - Start server
cd server
npm run dev
# Server running at http://localhost:8080

# Terminal 2 - Start client
cd client
npm run dev
# Client running at http://localhost:3000
```

Open http://localhost:3000 in two browser tabs to test the chat.
