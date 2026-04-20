const request = require('supertest');
const app = require('../index');

jest.mock('../db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('jsonwebtoken', () => ({
  verify: (token, secret, cb) => cb(null, { username: 'admin' }),
  sign: () => 'fake-token',
}));

const { pool } = require('../db');

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
    it('should return token for valid credentials', async () => {
      const res = await request(app)
        .post('/login')
        .send({ username: 'admin', password: 'admin123' });

      expect(res.statusCode).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.username).toBe('admin');
    });

    it('should return 401 for invalid credentials', async () => {
      const res = await request(app)
        .post('/login')
        .send({ username: 'wrong', password: 'wrong' });

      expect(res.statusCode).toBe(401);
    });

    it('should return 401 for wrong password', async () => {
      const res = await request(app)
        .post('/login')
        .send({ username: 'admin', password: 'wrongpassword' });

      expect(res.statusCode).toBe(401);
    });
  });

  // --- PANORAMAS ---
  describe('GET /panoramas', () => {
    it('should return all panoramas', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: 1, property_id: 10, level: '1' }],
      });

      const res = await request(app).get('/panoramas');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should return empty array when no panoramas exist', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app).get('/panoramas');

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should use WHERE EXISTS clause when unreviewed=true', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app).get('/panoramas?unreviewed=true');

      expect(res.statusCode).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE EXISTS')
      );
    });
  });

  // --- PANO BY ID ---
  describe('GET /pano/:id', () => {
    it('should return panorama metadata', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: 1, property_id: 2, level: '1', lat: 45.0, lon: -93.0 }],
      });

      const res = await request(app).get('/pano/1');

      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe(1);
    });

    it('should return 404 for nonexistent panorama', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app).get('/pano/99999');

      expect(res.statusCode).toBe(404);
    });
  });

  // --- PANO IMAGE ---
  describe('GET /pano/:id/image/:face', () => {
    it('should return image from blob column', async () => {
      const fakeImage = Buffer.from('fakeimagebytes');
      pool.query.mockResolvedValue({
        rows: [{ img: fakeImage, s3_key: null, image_content_type: 'image/jpeg' }],
      });

      const res = await request(app).get('/pano/1/image/front');

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/image\/jpeg/);
    });

    it('should return 404 when panorama not found', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app).get('/pano/99999/image/front');

      expect(res.statusCode).toBe(404);
    });

    it('should return 404 when face image is missing', async () => {
      pool.query.mockResolvedValue({
        rows: [{ img: null, s3_key: null, image_content_type: 'image/jpeg' }],
      });

      const res = await request(app).get('/pano/1/image/front');

      expect(res.statusCode).toBe(404);
    });
  });

  // --- DETECTIONS ---
  describe('GET /detections', () => {
    it('should return detections for a panorama', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: 1, pano_id: 5, ifc_class: 'ifcDoor', confidence: 0.92 }],
      });

      const res = await request(app).get('/detections?pano_id=5');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].ifc_class).toBe('ifcDoor');
    });

    it('should return empty array when no detections exist', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app).get('/detections?pano_id=5');

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // --- UPDATE IFC CLASS ---
  describe('POST /detection/:id/class', () => {
    it('should update detection class and return updated row', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: 1, ifc_class: 'ifcWindow', label_display: 'IFC  Window' }],
      });

      const res = await request(app)
        .post('/detection/1/class')
        .set('Authorization', 'Bearer test')
        .send({ ifc_class: 'ifcWindow' });

      expect(res.statusCode).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE detections SET ifc_class'),
        ['ifcWindow', expect.any(String), '1']
      );
    });
  });

  // --- UPDATE BBOX ---
  describe('POST /detection/:id/bbox', () => {
    it('should update bounding box and return updated row', async () => {
      const bbox = [0.5, 0.5, 0.2, 0.2];
      pool.query.mockResolvedValue({
        rows: [{ id: 1, bbox_xywh: bbox }],
      });

      const res = await request(app)
        .post('/detection/1/bbox')
        .set('Authorization', 'Bearer test')
        .send({ bbox_xywh: bbox });

      expect(res.statusCode).toBe(200);
      expect(res.body.bbox_xywh).toEqual(bbox);
    });
  });

  // --- REVIEW ---
  describe('POST /review', () => {
    it('should insert a reject review', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post('/review')
        .set('Authorization', 'Bearer test')
        .send({ detection_id: 1, action: 'reject', note: 'false positive' });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reviews'),
        [1, 'admin', 'reject', null, 'false positive']
      );
    });

    it('should insert a reclassify review with new_class', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .post('/review')
        .set('Authorization', 'Bearer test')
        .send({ detection_id: 2, action: 'reclassify', new_class: 'ifcWindow' });

      expect(res.statusCode).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reviews'),
        [2, 'admin', 'reclassify', 'ifcWindow', null]
      );
    });

    it('should create an asset record when action is confirm', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] }) // INSERT INTO reviews
        .mockResolvedValueOnce({ rows: [] }) // SELECT FROM assets (no existing asset)
        .mockResolvedValueOnce({             // SELECT detection + panorama data
          rows: [{
            id: 5, property_id: 1, level: '1',
            ifc_class: 'ifcDoor', label_display: 'IFC Door',
            lat: 45.0, lon: -93.0, alt: 0
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // INSERT INTO assets

      const res = await request(app)
        .post('/review')
        .set('Authorization', 'Bearer test')
        .send({ detection_id: 5, action: 'confirm' });

      expect(res.statusCode).toBe(200);
      expect(pool.query).toHaveBeenCalledTimes(4);
      expect(pool.query).toHaveBeenLastCalledWith(
        expect.stringContaining('INSERT INTO assets'),
        expect.any(Array)
      );
    });

    it('should not create duplicate asset if one already exists', async () => {
      pool.query
        .mockResolvedValueOnce({ rows: [] })       // INSERT INTO reviews
        .mockResolvedValueOnce({ rows: [{ id: 99 }] }); // SELECT FROM assets (already exists)

      const res = await request(app)
        .post('/review')
        .set('Authorization', 'Bearer test')
        .send({ detection_id: 5, action: 'confirm' });

      expect(res.statusCode).toBe(200);
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it('should return 500 on database error', async () => {
      pool.query.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .post('/review')
        .set('Authorization', 'Bearer test')
        .send({ detection_id: 1, action: 'confirm' });

      expect(res.statusCode).toBe(500);
    });
  });

  // --- ASSETS ---
  describe('GET /assets', () => {
    it('should return all assets', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: 1, ifc_class: 'ifcDoor', property_name: 'Building A' }],
      });

      const res = await request(app).get('/assets');

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should filter assets by property_id', async () => {
      pool.query.mockResolvedValue({
        rows: [{ id: 1, property_id: 3, ifc_class: 'ifcWindow' }],
      });

      const res = await request(app).get('/assets?property_id=3');

      expect(res.statusCode).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.property_id'),
        ['3']
      );
    });

    it('should return empty array when no assets exist', async () => {
      pool.query.mockResolvedValue({ rows: [] });

      const res = await request(app).get('/assets');

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // --- INGEST PANO-SET ---
  describe('POST /ingest/pano-set', () => {
    it('should return 400 when neither front nor back image is provided', async () => {
      const res = await request(app)
        .post('/ingest/pano-set')
        .set('Authorization', 'Bearer test')
        .field('property_id', '1')
        .field('level', '1');

      expect(res.statusCode).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toMatch(/front|back/i);
    });
  });
});
