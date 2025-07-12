# MCP Frontend SDK

This package provides a React component for integrating the MCP chatbot into any application.

## Installation

```
npm install frontend-sdk
```

## Usage

```tsx
import { ChatBot } from 'frontend-sdk';

function App() {
  return (
    <ChatBot
      serverUrl="ws://localhost:8001/chat"
      token="YOUR_AUTH_TOKEN"
      theme="dark"
    />
  );
}
```

## Props

| Prop      | Type                 | Description                                    |
|-----------|---------------------|------------------------------------------------|
| `serverUrl` | `string`             | WebSocket URL of the MCP backend.              |
| `token`   | `string`             | Authentication token sent when connecting.     |
| `theme`   | `'light' \| 'dark'` | Optional theme. Defaults to `light`.           |

## Theming

Use the `theme` prop to switch between the built in `light` and `dark` themes. You can extend the styles by overriding the CSS variables `--mcp-bg` and `--mcp-text`.

## Development

Run the TypeScript build:

```
npm run build
```

This will compile the source into the `dist/` folder.
