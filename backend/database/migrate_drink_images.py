import sqlite3
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BACKEND_DIR / 'database' / 'mixes.db'
IMAGE_DIR = BACKEND_DIR.parent.parent.parent / 'src' / 'images'


def migrate():
    with sqlite3.connect(DB_PATH) as connection:
        columns = {
            row[1] for row in connection.execute('PRAGMA table_info(drinks)')
        }
        if 'image_data' not in columns:
            connection.execute('ALTER TABLE drinks ADD COLUMN image_data BLOB')

        old_images = {}
        image_table_exists = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'drink_images'"
        ).fetchone()
        if image_table_exists:
            old_images = dict(connection.execute(
                'SELECT drink_id, image_data FROM drink_images'
            ).fetchall())

        drinks = connection.execute('SELECT ID, Getränk FROM drinks').fetchall()
        for drink_id, name in drinks:
            image_data = old_images.get(drink_id)
            if image_data is None:
                image_path = IMAGE_DIR / f'{name}.png'
                if image_path.exists():
                    image_data = image_path.read_bytes()
                else:
                    print(f'Bild fehlt: {image_path.name}')
            if image_data is not None:
                connection.execute(
                    'UPDATE drinks SET image_data = ? WHERE ID = ?',
                    (image_data, drink_id)
                )

        if image_table_exists:
            connection.execute('DROP TABLE drink_images')

    print('drinks.image_data wurde angelegt und die Bilder wurden importiert.')


if __name__ == '__main__':
    migrate()