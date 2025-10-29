import psycopg2
import sys

TABLES = [
    "detections",
    "reviews",
    "assets",
    "panoramas",
    "properties"
]

def clear_database():
    try:
        conn = psycopg2.connect(
            dbname="ifc_assets",
            user="postgres",
            password="postgres",
            host="localhost",
            port="5432"
        )
        cur = conn.cursor()
        print("Connected to database successfully.")
        print("Clearing database...")

        # Disable foreign key checks temporarily
        cur.execute("SET session_replication_role = 'replica';")
        
        for table in TABLES:
            cur.execute(f'TRUNCATE TABLE {table} RESTART IDENTITY CASCADE;')
            print(f"Cleared {table}")

        # Re-enable foreign key checks
        cur.execute("SET session_replication_role = 'origin';")

        conn.commit()
        cur.close()
        conn.close()
        print("Database cleared successfully.")
        return True
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