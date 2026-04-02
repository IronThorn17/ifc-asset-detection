const request = require('supertest');
const app = require('../index');

// Mock pg
jest.mock('../db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

const { pool } = require('../db');

describe('API Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return 200 ok', async () => {
      const res = await request(app).get('/health');
      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({ ok: true });
    });
  });

  describe('POST /review', () => {
    it('should create a review successfully', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post('/review')
        .send({
          detection_id: 123,
          action: 'confirm',
          note: 'Test review'
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body).toEqual({ ok: true });
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reviews'),
        [123, "student", "confirm", null, "Test review"]
      );
    });

    it('should handle errors', async () => {
      pool.query.mockRejectedValueOnce(new Error('DB Error'));

      const res = await request(app)
        .post('/review')
        .send({
          detection_id: 123,
          action: 'confirm'
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.ok).toBe(false);
    });
  });
});
