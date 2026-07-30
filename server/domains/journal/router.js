// 4.5b차 — 거래일지 API. requireDeviceIdMiddleware로 device_id 필수. 데이터 없으면 available:false 폴백(500 금지).
// analysis(GET)는 4.5b-2에서 추가.
import express from 'express';
import { requireDeviceIdMiddleware } from '../../helpers/deviceId.js';
import { ingest, deleteAll, analyze } from './service.js';

const router = express.Router();
router.use(requireDeviceIdMiddleware);

// POST /api/journal/upload  body:{ csvText, broker? } → { broker, imported, skipped, dateRange, coverage }
// csvText는 프론트에서 EUC-KR 디코드된 텍스트. 서버는 iconv/multer 불필요.
router.post('/upload', async (req, res) => {
    const { csvText, broker } = req.body || {};
    if (!csvText || typeof csvText !== 'string' || csvText.trim() === '') {
        return res.status(400).json({ error: 'csvText is required' });
    }
    try {
        const result = await ingest(req.deviceId, csvText, broker);
        res.json(result);
    } catch (e) {
        console.error('journal upload error:', e.message);
        res.status(500).json({ error: '거래내역을 처리하지 못했어요. 파일 형식을 확인해 주세요.' });
    }
});

// GET /api/journal/analysis → { available, summary, biases, coverage }
// 데이터 없으면 available:false (500 금지).
router.get('/analysis', async (req, res) => {
    try {
        const result = await analyze(req.deviceId);
        res.json(result);
    } catch (e) {
        console.error('journal analysis error:', e.message);
        res.json({ available: false });
    }
});

// DELETE /api/journal → 해당 device 거래 전량 삭제
router.delete('/', async (req, res) => {
    try {
        const result = await deleteAll(req.deviceId);
        res.json(result);
    } catch (e) {
        console.error('journal delete error:', e.message);
        res.status(500).json({ error: '삭제에 실패했어요.' });
    }
});

export default router;
