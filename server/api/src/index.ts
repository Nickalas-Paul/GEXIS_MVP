import './config/env';

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { databaseReady, verifyDatabaseConnection } from './config/database';
import { connectRedis, redisReady } from './config/redis';
import authRoutes from './routes/auth';
import agentRoutes from './routes/agents';
import exportRoutes from './routes/exports';
import geographyRoutes from './routes/geographies';
import mviRoutes from './routes/mvi';
import savedSearchRoutes from './routes/savedSearches';
import devRoutes from './routes/dev';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

app.use(helmet());
app.use(cors());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/readyz', (_req, res) => {
  if (!databaseReady || !redisReady) {
    res.status(503).json({
      status: 'not_ready',
      database: databaseReady,
      redis: redisReady,
    });
    return;
  }
  res.json({ status: 'ready', database: true, redis: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/geographies', geographyRoutes);
app.use('/api/mvi', mviRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/saved-searches', savedSearchRoutes);
app.use('/api/agents', agentRoutes);

if (process.env.NODE_ENV !== 'production') {
  app.use('/api/dev', devRoutes);
}

async function start(): Promise<void> {
  const dbOk = await verifyDatabaseConnection();
  const redisOk = await connectRedis();

  app.listen(PORT, () => {
    console.log(`GEXIS API listening on port ${PORT}`);
    console.log(`[startup] Database connection: ${dbOk ? 'OK' : 'FAILED'}`);
    console.log(`[startup] Redis connection: ${redisOk ? 'OK' : 'FAILED'}`);
  });
}

start().catch((err) => {
  console.error('[startup] Failed to start server:', err);
  process.exit(1);
});