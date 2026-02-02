# 🔬 OpenClaw Research API

**Our first x402 paywalled service!**

A payment-enabled AI research API using the x402 protocol. Agents and developers can pay per-query for AI-powered research and text summarization.

## 🎯 What is this?

This is OpenClaw's first x402 service - a proof of concept demonstrating how to:
- Build a paywalled API using Coinbase's x402 protocol
- Accept stablecoin micropayments (USDC) on Base
- List services in the x402 Bazaar for discovery

## 💰 Pricing

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /research` | $0.005 | AI-powered research on any topic |
| `POST /summarize` | $0.003 | Summarize text into key points |
| `GET /health` | Free | Health check |

## 🚀 Quick Start

### 1. Setup

```bash
cd x402-services/research-api
cp .env.example .env
# Edit .env with your wallet address
```

### 2. Start Server

```bash
npm start
# or for development with auto-reload:
npm run dev
```

### 3. Test Health Endpoint

```bash
curl http://localhost:4021/health | jq .
```

## 📡 API Reference

### POST /research

Submit a research query and get structured findings.

**Request:**
```json
{
  "query": "What is the x402 protocol?",
  "depth": "quick"  // optional: "quick", "standard", or "deep"
}
```

**Response:**
```json
{
  "success": true,
  "query": "What is the x402 protocol?",
  "depth": "quick",
  "summary": "Research findings...",
  "keyPoints": ["Point 1", "Point 2"],
  "insights": "Based on the research...",
  "relatedTopics": ["topic1", "topic2"],
  "confidence": 0.85,
  "sources": { "web": 5, "academic": 2 },
  "processingTimeMs": 123
}
```

### POST /summarize

Summarize any text into key points.

**Request:**
```json
{
  "text": "Your long text here...",
  "style": "bullet"  // optional: "bullet", "paragraph", "executive"
}
```

**Response:**
```json
{
  "success": true,
  "style": "bullet",
  "summary": "• Point 1\n• Point 2",
  "keyPoints": ["Point 1", "Point 2"],
  "wordCount": {
    "original": 1500,
    "summary": 150
  },
  "processingTimeMs": 50
}
```

## 💳 How x402 Payment Works

1. Client makes request to endpoint
2. Server returns `402 Payment Required` with payment instructions
3. Client signs payment transaction
4. Client retries with `PAYMENT-SIGNATURE` header
5. Server verifies payment via facilitator
6. Server returns actual response

For clients, use the x402 SDK:

```typescript
import { wrapFetchWithPayment } from "@x402/fetch";

const fetch402 = wrapFetchWithPayment(fetch, client);
const response = await fetch402("https://your-api.com/research", {
  method: "POST",
  body: JSON.stringify({ query: "What is x402?" })
});
```

## 🔧 Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PAY_TO_ADDRESS` | Yes | - | Your Base wallet address |
| `FACILITATOR_URL` | No | testnet | x402 facilitator endpoint |
| `PORT` | No | 4021 | Server port |

## 🌐 Network Support

- **Testnet**: Base Sepolia (`eip155:84532`) - for testing
- **Mainnet**: Base (`eip155:8453`) - for production

## 📦 Deployment

### Local Testing
```bash
npm start
```

### Production (with ngrok for testing)
```bash
ngrok http 4021
# Use the ngrok URL to test x402 payments
```

### Cloud Deployment
Deploy to any Node.js host (Render, Railway, Vercel, etc.)

For mainnet, update:
1. `FACILITATOR_URL` to CDP mainnet
2. Network to `eip155:8453`
3. Add CDP API keys

## 🛠️ Future Enhancements

- [ ] Connect to real LLM (Claude/GPT) for actual research
- [ ] Add web search capabilities
- [ ] Support streaming responses
- [ ] Add usage analytics
- [ ] Implement rate limiting per payer

## 📄 License

MIT - Built by OpenClaw 🐻‍❄️

---

*Part of the OpenClaw x402 Singularity Layer - enabling AI agents to earn and spend autonomously.*
