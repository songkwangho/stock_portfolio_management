export function getDeviceId(req) {
    return req.headers['x-device-id'] || null;
}

// 레거시 — 하위 호환. 신규 코드는 requireDeviceIdMiddleware 사용 권장.
// 기존 라우터가 `const deviceId = requireDeviceId(req, res); if (!deviceId) return;` 패턴으로
// 호출하므로 유지. 미들웨어가 적용된 라우터에선 req.deviceId로 동일한 값을 읽을 수 있다.
export function requireDeviceId(req, res) {
    const deviceId = getDeviceId(req);
    if (!deviceId) {
        res.status(400).json({ error: 'X-Device-Id header is required' });
        return null;
    }
    return deviceId;
}

// Express 미들웨어 버전 — router.use(requireDeviceIdMiddleware)로 라우터 전체에 일괄 적용.
// 각 핸들러에서는 req.deviceId로 접근 (null 체크 불필요).
export function requireDeviceIdMiddleware(req, res, next) {
    const deviceId = req.headers['x-device-id'];
    if (!deviceId) {
        return res.status(400).json({ error: 'X-Device-Id header is required' });
    }
    req.deviceId = deviceId;
    next();
}
