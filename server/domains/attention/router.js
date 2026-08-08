// A차(주목 레이어) — GET /api/attention. requireDeviceIdMiddleware로 device 스코프 격리.
// 실패해도 500 대신 available:false (보조 블록이라 대시보드 흐름을 막지 않는다).
import express from 'express';
import { requireDeviceIdMiddleware } from '../../helpers/deviceId.js';
import { getAttention } from './service.js';

const router = express.Router();
router.use(requireDeviceIdMiddleware);

// GET /api/attention → { available, items:[...], asOfDate, constants }
router.get('/', async (req, res) => {
    try {
        res.json(await getAttention(req.deviceId));
    } catch (e) {
        console.error('attention error:', e.message);
        res.json({ available: false, reason: 'error' });
    }
});

export default router;
