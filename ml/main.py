import os, time, json, random, psycopg
DB_URL = os.getenv("DB_URL", "postgres://postgres:postgres@db:5432/ifc_assets")
PANO_ID = int(os.getenv("MOCK_PANO_ID", "1"))

def insert_mock_detection(conn, pano_id):
    with conn.cursor() as cur:
        cur.execute("""
          INSERT INTO detections
            (pano_id, model_version, ifc_class, label_display, confidence, face_id, bbox_xywh, sphere_coords_json)
          VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            pano_id, "mock-v0",
            random.choice(["IfcDoor","IfcLightFixture","IfcAirTerminal"]),
            "MockLabel", round(random.uniform(0.81, 0.97), 2),
            random.choice(["front","back","left","right","up","down"]),
            [random.randint(20,200), random.randint(20,200), 60, 120],
            json.dumps({"hint":"replace with real spherical coords"})
        ))
    conn.commit()

def main():
    print("ML mock running...")
    with psycopg.connect(DB_URL) as conn:
        while True:
            insert_mock_detection(conn, PANO_ID)
            time.sleep(8)

if __name__ == "__main__":
    main()
