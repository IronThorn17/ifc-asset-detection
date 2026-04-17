import psycopg2
import sys

TABLES = [
    "detections",
    "reviews",
    "assets",
    "panoramas",
    "properties",
]

LOCK_TIMEOUT_MS = 5000


def clear_database():
    try:
        conn = psycopg2.connect(
            dbname="ifc_assets",
            user="postgres",
            password="postgrespassword",
            host="ifc-asset-db.c4decyoca1od.us-east-1.rds.amazonaws.com",
            port="5432",
        )

        conn.autocommit = False
        cur = conn.cursor()
        print("Connected to database successfully.")

        cur.execute(f"SET lock_timeout = '{LOCK_TIMEOUT_MS}ms';")

        print("Clearing database...")

        table_list = ", ".join(TABLES)
        cur.execute(f"TRUNCATE TABLE {table_list} RESTART IDENTITY CASCADE;")

        conn.commit()
        cur.close()
        conn.close()

        for table in TABLES:
            print(f"  Cleared {table}")
        print("Database cleared successfully.")
        return True

    except psycopg2.errors.LockNotAvailable:
        print(
            "Error: Could not acquire locks within the timeout. "
            "Another connection (e.g. the running app or Docker container) is holding "
            "locks on one or more tables.\n"
            "Stop the app/container and try again, or increase LOCK_TIMEOUT_MS."
        )
        return False
    except Exception as e:
        print(f"Error clearing database: {e}")
        return False

if __name__ == "__main__":
    response = input("This will remove all data from the database. Are you sure? (yes/no): ")
    if response.lower() in ['yes', 'y']:
        success = clear_database()
        if success:
            print("Database has been cleared.")
        else:
            print("Failed to clear database.")
            sys.exit(1)
    else:
        print("Operation cancelled.")