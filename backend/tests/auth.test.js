const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');

// Mock db only — do NOT mock jsonwebtoken so auth middleware runs for real
jest.mock('../db', () => ({
  pool: { query: jest.fn() },
}));

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';

describe('Authentication Middleware', () => {
  it('should return 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .post('/review')
      .send({ detection_id: 1, action: 'confirm' });

    expect(res.statusCode).toBe(401);
  });

  it('should return 401 when Authorization header has no token', async () => {
    const res = await request(app)
      .post('/review')
      .set('Authorization', 'Bearer ')
      .send({ detection_id: 1, action: 'confirm' });

    expect(res.statusCode).toBe(401);
  });

  it('should return 403 when token is invalid', async () => {
    const res = await request(app)
      .post('/review')
      .set('Authorization', 'Bearer not.a.valid.token')
      .send({ detection_id: 1, action: 'confirm' });

    expect(res.statusCode).toBe(403);
  });

  it('should return 403 when token is signed with wrong secret', async () => {
    const badToken = jwt.sign({ username: 'admin' }, 'wrong_secret');

    const res = await request(app)
      .post('/review')
      .set('Authorization', `Bearer ${badToken}`)
      .send({ detection_id: 1, action: 'confirm' });

    expect(res.statusCode).toBe(403);
  });

  it('should allow request through with valid token', async () => {
    const { pool } = require('../db');
    pool.query.mockResolvedValue({ rows: [] });

    const token = jwt.sign({ username: 'admin' }, JWT_SECRET);

    const res = await request(app)
      .post('/review')
      .set('Authorization', `Bearer ${token}`)
      .send({ detection_id: 1, action: 'reject' });

    expect(res.statusCode).toBe(200);
  });

  it('should protect POST /detection/:id/class', async () => {
    const res = await request(app)
      .post('/detection/1/class')
      .send({ ifc_class: 'ifcDoor' });

    expect(res.statusCode).toBe(401);
  });

  it('should protect POST /detection/:id/bbox', async () => {
    const res = await request(app)
      .post('/detection/1/bbox')
      .send({ bbox_xywh: [0.5, 0.5, 0.1, 0.1] });

    expect(res.statusCode).toBe(401);
  });

  it('should protect POST /ml/retrain', async () => {
    const res = await request(app).post('/ml/retrain');

    expect(res.statusCode).toBe(401);
  });
});
