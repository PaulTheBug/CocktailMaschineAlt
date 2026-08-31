import sqlite3
import os

class CocktailDatabase:
    PUMP_COUNT = 8

    def __init__(self, db_path='database/mixes.db'):
        self.db_path = db_path
        self._check_database_exists()

    def _check_database_exists(self):
        if not os.path.exists(self.db_path):
            raise FileNotFoundError(f"Datenbank {self.db_path} nicht gefunden!")

    def _get_conn(self):
        return sqlite3.connect(self.db_path)

    def get_drink_image(self, drink_id):
        """Gibt die Bilddaten eines Drinks zurück."""
        with self._get_conn() as conn:
            return conn.execute(
                'SELECT image_data FROM drinks WHERE ID = ?',
                (drink_id,)
            ).fetchone()

    # -------------------------------------------------------------------------
    # Cocktails
    # -------------------------------------------------------------------------

    def get_available_cocktails(self, alkoholisch=None):
        """Verfügbare Cocktails via JOIN über drinks → recipies → ingredients."""
        with self._get_conn() as conn:
            params = []
            query = '''
                SELECT d.ID, d.Getränk, d.Alkohol, d.Beschreibung, d.image_data,
                       i.ingredientID, i.ingredient, i.isLiquid,
                       r.level AS amount_ml,
                       i.currentLevel
                FROM drinks d
                JOIN recipies r ON r.drinkID = d.ID
                JOIN ingredients i ON i.ingredientID = r.ingredientID
            '''
            if alkoholisch is not None:
                query += ' WHERE d.Alkohol = ?'
                params.append(alkoholisch)
            query += ' ORDER BY d.ID, i.ingredientID'

            cursor = conn.execute(query, params)
            rows = cursor.fetchall()

        # Group rows by drink
        drinks_map = {}
        for row in rows:
            drink_id, name, alkohol_flag, description, \
                image_data, ing_id, ing_name, is_liquid, amount_ml, current_level = row

            if drink_id not in drinks_map:
                drinks_map[drink_id] = {
                    'id': drink_id,
                    'name': name,
                    'image_path': f'http://127.0.0.1:5000/api/cocktails/{drink_id}/image',
                    'alkoholisch': bool(alkohol_flag),
                    'description': description,
                    'glass_size_ml': 350,
                    'liquid_recipe': [],
                    'manual_ingredients': [],
                    'requires_manual_steps': False,
                    # internal tracking only
                    '_makeable': True,
                }

            drink = drinks_map[drink_id]

            if is_liquid:
                # Check availability for real pourable ingredients; ingredients beyond
                # the 8 physical pumps are treated as virtual/external additions.
                if current_level < amount_ml:
                    drink['_makeable'] = False

                is_virtual = ing_id > self.PUMP_COUNT

                drink['liquid_recipe'].append({
                    'pump_id': ing_id - 1 if not is_virtual else None,
                    'ingredient_id': ing_id,
                    'ingredient_name': ing_name,
                    'amount_ml': amount_ml,
                    'is_liquid': True,
                    'is_virtual': is_virtual,
                })
            else:
                drink['manual_ingredients'].append({
                    'ingredient_id': ing_id,
                    'ingredient_name': ing_name,
                    'amount_ml': amount_ml,
                    'is_liquid': False,
                    'is_virtual': True,
                    'pump_id': None,
                    'instruction': self._get_manual_instruction(ing_name, amount_ml),
                })
                drink['requires_manual_steps'] = True

        # Filter out drinks that can't be made and clean internal keys
        available = []
        for drink in drinks_map.values():
            if drink.pop('_makeable'):
                available.append(drink)

        return available

    def get_cocktail_by_id(self, cocktail_id):
        cocktails = self.get_available_cocktails()
        return next((c for c in cocktails if c['id'] == cocktail_id), None)

    def get_alcoholic_cocktails(self):
        return self.get_available_cocktails(alkoholisch=1)

    def get_non_alcoholic_cocktails(self):
        return self.get_available_cocktails(alkoholisch=0)

    # -------------------------------------------------------------------------
    # Ingredients
    # -------------------------------------------------------------------------

    def get_ingredients_status(self):
        """Status aller Zutaten."""
        with self._get_conn() as conn:
            cursor = conn.execute('''
                SELECT ingredientID, ingredient, isLiquid, currentLevel, maxLevel
                FROM ingredients
                ORDER BY ingredientID
            ''')
            return [
                {
                    'ingredient_id': row[0],
                    'ingredient_name': row[1],
                    'is_liquid': bool(row[2]),
                    'current_level': row[3],
                    'max_level': row[4],
                    'is_virtual': (not bool(row[2])) or (row[0] > self.PUMP_COUNT),
                    'pump_id': row[0] - 1 if bool(row[2]) and row[0] <= self.PUMP_COUNT else None,
                }
                for row in cursor.fetchall()
            ]

    def update_ingredient_level(self, ingredient_id, used_amount):
        """Reduziert den Level einer Zutat nach dem Mixen."""
        with self._get_conn() as conn:
            conn.execute('''
                UPDATE ingredients
                SET currentLevel = MAX(0, currentLevel - ?)
                WHERE ingredientID = ?
            ''', (used_amount, ingredient_id))

            cursor = conn.execute(
                'SELECT ingredient, currentLevel FROM ingredients WHERE ingredientID = ?',
                (ingredient_id,)
            )
            result = cursor.fetchone()
            if result:
                print(f"📉 {result[0]}: -{used_amount}ml (noch {result[1]}ml)")

    def set_ingredient_level(self, ingredient_id, new_level):
        """Setzt den Level einer Zutat auf einen bestimmten Wert."""
        new_level = max(0, new_level)
        with self._get_conn() as conn:
            conn.execute('''
                UPDATE ingredients
                SET currentLevel = ?, maxLevel = ?
                WHERE ingredientID = ?
            ''', (new_level, new_level, ingredient_id))
            print(f"🔄 Zutat {ingredient_id} auf {new_level}ml gesetzt")

    def refill_ingredient(self, ingredient_id, add_amount):
        """Füllt eine Zutat additiv auf."""
        with self._get_conn() as conn:
            cursor = conn.execute(
                'SELECT currentLevel, maxLevel FROM ingredients WHERE ingredientID = ?',
                (ingredient_id,)
            )
            result = cursor.fetchone()
            if result is None:
                return False

            current_level, max_level = result
            new_level = current_level + add_amount
            new_max = max(max_level, new_level)

            conn.execute('''
                UPDATE ingredients
                SET currentLevel = ?, maxLevel = ?
                WHERE ingredientID = ?
            ''', (new_level, new_max, ingredient_id))

            print(f"🔄 Zutat {ingredient_id}: {current_level}ml + {add_amount}ml = {new_level}ml")
            return True

    def refill_all_ingredients(self, level):
        """Setzt alle Zutaten auf einen bestimmten Level."""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute('UPDATE ingredients SET currentLevel = ?', (level,))
            updated_rows = cursor.rowcount
            conn.commit()
            print(f"🔄 Alle Zutaten auf {level}ml gesetzt ({updated_rows} Zutaten aktualisiert)")
            return updated_rows

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    @staticmethod
    def _get_manual_instruction(ingredient_name, amount):
        instructions = {
            'Limette':     f'Schneide {amount} Limettenscheibe(n) und gib sie ins Glas',
            'Rohrzucker':  f'Füge {amount}g Rohrzucker hinzu',
            'Minze':       f'Gib {amount} Minzblätter ins Glas und muddle sie leicht',
        }
        return instructions.get(
            ingredient_name,
            f'{ingredient_name} manuell hinzufügen: {amount} Einheit(en)'
        )