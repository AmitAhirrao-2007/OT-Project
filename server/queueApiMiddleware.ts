/**
 * Smart Charging Queue API Middleware
 * Handles /api/queue/* requests across Vite dev server and standalone proxy.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';
import {
  getAggregatedStationQueue,
  submitQueueReport
} from './queueStorage';
import { QueueReportSubmission } from '../src/types/queue';

function parseJsonBody(req: IncomingMessage, maxBytes = 65536): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch {
        resolve({});
      }
    });
    req.on('error', (err) => reject(err));
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(data));
}

export async function handleQueueApiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const parsed = parseUrl(req.url || '', true);
  const pathname = parsed.pathname || '';

  if (!pathname.startsWith('/api/queue')) {
    return false;
  }

  // Pre-flight CORS
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.end();
    return true;
  }

  // 1. GET /api/queue/station/:stationId
  if (req.method === 'GET' && pathname.startsWith('/api/queue/station/')) {
    const stationId = decodeURIComponent(pathname.replace('/api/queue/station/', ''));
    if (!stationId) {
      sendJson(res, 400, { error: 'Missing stationId parameter' });
      return true;
    }

    const queueData = getAggregatedStationQueue(stationId);
    if (!queueData) {
      sendJson(res, 404, { error: `Station ${stationId} not found` });
      return true;
    }

    sendJson(res, 200, queueData);
    return true;
  }

  // 2. GET /api/queue/stations?ids=id1,id2,id3...
  if (req.method === 'GET' && pathname === '/api/queue/stations') {
    const rawIds = typeof parsed.query.ids === 'string' ? parsed.query.ids : '';
    let decoded = rawIds;
    try {
      decoded = decodeURIComponent(rawIds);
    } catch {}
    const ids = decoded.split(',').map((s) => s.trim()).filter(Boolean);
    const queues: Record<string, any> = {};
    for (const id of ids.slice(0, 150)) {
      const q = getAggregatedStationQueue(id);
      if (q) queues[id] = q;
    }
    sendJson(res, 200, {
      queues,
      count: Object.keys(queues).length,
      requestedCount: ids.length,
      timestamp: Date.now()
    });
    return true;
  }

  // 2. POST /api/queue/report
  if (req.method === 'POST' && pathname === '/api/queue/report') {
    try {
      const body = (await parseJsonBody(req)) as QueueReportSubmission;
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.socket.remoteAddress ||
        '127.0.0.1';

      const result = submitQueueReport(body, clientIp);
      sendJson(res, result.success ? 200 : 429, result);
      return true;
    } catch (err: unknown) {
      sendJson(res, 400, {
        success: false,
        message: err instanceof Error ? err.message : 'Invalid request body'
      });
      return true;
    }
  }

  return false;
}

