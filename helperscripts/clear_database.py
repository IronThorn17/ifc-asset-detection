import psycopg2

TABLES = [
    "detections",
    "reviews",
    "assets",
    "panoramas",
    "properties"
]

def clear_database():
    conn = psycopg2.connect(
        dbname="ifc_assets",
        user="postgres",
        password="postgres",
        host="localhost",
        port="5432"
    )
    cur = conn.cursor()
    print("Clearing database...")

    for table in TABLES:
        cur.execute(f'TRUNCATE TABLE {table} RESTART IDENTITY CASCADE;')
        print(f"Cleared {table}")

    conn.commit()
    cur.close()
    conn.close()
    print("Database cleared successfully.")

if __name__ == "__main__":
    clear_database()
