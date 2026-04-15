const request = require('supertest');
const app = require('../index');

// Mock db
jest.mock('../db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const { pool } = require('../db');

// Mock JWT so auth always passes
jest.mock('jsonwebtoken', () => ({
  verify: (token, secret, cb) => cb(null, { username: 'admin' }),
  sign: () => 'fake-token',
}));

describe('API Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- HEALTH ---
  describe('GET /health', () => {
    it('should return ok', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });

  // --- LOGIN ---
  describe('POST /login', () => {
    it('should login successfully', async () => {
      const res = await request(app)
        .post('/login')
        .send({ username: 'admin', password: 'admin123' });

      expect(res.statusCode).toBe(200);
      expect(res.body.token).toBeDefined();
    });

    it('should fail login', async () => {
      const res = await request(app)
        .post('/login')
        .send({ username: 'wrong', password: 'wrong' });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- PANORAMAS ---
  describe('GET /panoramas', () => {
    it('should return panoramas', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: 1, property_id: 10 }],
      });

      const res = await request(app).get('/panoramas');

      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(1);
    });

    it('should filter unreviewed panoramas', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app).get('/panoramas?unreviewed=true');

      expect(res.statusCode).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE EXISTS')
      );
    });
  });

  // --- DETECTIONS ---
  describe('GET /detections', () => {
    it('should return detections for pano', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: 1, pano_id: 5 }],
      });

      const res = await request(app).get('/detections?pano_id=5');

      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(1);
    });
  });

  // --- UPDATE BBOX ---
  describe('POST /detection/:id/bbox', () => {
    it('should update bbox', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: 1, bbox_xywh: [0.5, 0.5, 0.2, 0.2] }],
      });

      const res = await request(app)
        .post('/detection/1/bbox')
        .set('Authorization', 'Bearer test')
        .send({ bbox_xywh: [0.5, 0.5, 0.2, 0.2] });

      expect(res.statusCode).toBe(200);
      expect(res.body.bbox_xywh).toBeDefined();
    });
  });

  // --- REVIEW ---
  describe('POST /review', () => {
    it('should insert review', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post('/review')
        .set('Authorization', 'Bearer test')
        .send({
          detection_id: 1,
          action: 'confirm',
          note: 'test'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reviews'),
        [1, 'admin', 'confirm', null, 'test']
      );
    });

    it('should handle db error', async () => {
      pool.query.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .post('/review')
        .set('Authorization', 'Bearer test')
        .send({
          detection_id: 1,
          action: 'confirm'
        });

      expect(res.statusCode).toBe(500);
    });
  });

  // --- ASSETS ---
  describe('GET /assets', () => {
    it('should return assets', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: 1 }]
      });

      const res = await request(app).get('/assets');

      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(1);
    });
  });

  // --- PANO ---
  describe('GET /pano/:id', () => {
    it('should return pano', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: 1 }]
      });

      const res = await request(app).get('/pano/1');

      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe(1);
    });

    it('should return 404 if not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app).get('/pano/999');

      expect(res.statusCode).toBe(404);
    });
  });
});