import psycopg
import sys

DB_CONFIG = {
    "dbname": "ifc_assets",
    "user": "postgres",
    "password": "postgres",
    "host": "localhost",
    "port": "5432",
}


def reset_detections():
    try:
        conn = psycopg.connect(**DB_CONFIG, connect_timeout=5)
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*) FROM detections")
        det_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM reviews")
        rev_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM assets")
        asset_count = cur.fetchone()[0]

        print(f"Found: {det_count} detections, {rev_count} reviews, {asset_count} assets")
        print("This will delete all detections, reviews, and assets.")
        print("Panoramas will be kept. The ML service will reprocess all panoramas on next poll.")
        print()
        print("NOTE: Stop the ML and backend containers before running this to avoid lock conflicts:")
        print("  docker-compose stop ml backend")

        response = input("Continue? (yes/no): ").strip().lower()
        if response not in ("yes", "y"):
            print("Cancelled.")
            return False

        cur.execute("SET lock_timeout = '5s'")
        cur.execute("TRUNCATE TABLE assets, reviews, detections RESTART IDENTITY CASCADE")
        conn.commit()
        cur.close()
        conn.close()

        print("Done. Detections, reviews, and assets cleared.")
        print("Start the stack again with: docker-compose up -d")
        return True

    except psycopg.errors.LockNotAvailable:
        print("Error: Could not acquire lock - another connection is actively using these tables.")
        print("Stop the ML and backend containers first:")
        print("  docker-compose stop ml backend")
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False


if __name__ == "__main__":
    success = reset_detections()
    sys.exit(0 if success else 1)
