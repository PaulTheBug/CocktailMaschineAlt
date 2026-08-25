from flask import Flask, jsonify
from flask_cors import CORS
from backend.api.cocktails import cocktails_bp

app = Flask(__name__)
CORS(app)

# API-Routes registrieren
app.register_blueprint(cocktails_bp, url_prefix='/api')

@app.route('/')
def home():
    return jsonify({
        'message': 'Cocktail-Maschine Backend 🍸',
        'version': '2.0.0',
        'endpoints': {
            'cocktails': '/api/cocktails',
            'alcoholic': '/api/cocktails/alcoholic',
            'non_alcoholic': '/api/cocktails/non-alcoholic',
            'ingredients': '/api/ingredients',
            'order': '/api/order',
            'status': '/api/status',
            'test_pump': '/api/test-pump/<pump_id>',
            'check_pin': '/api/check-pin',     
            'change_pin': '/api/change-pin'
        },
        'new_features': [
            'Unterscheidung zwischen flüssigen und manuellen Zutaten',
            'Automatische Anweisungen für manuelle Schritte',
            'Ingredients-Tabelle statt Bottles'
        ]
    })

if __name__ == '__main__':
    print("🚀 Starte Cocktail-Maschine Backend v2.0...")
    app.run(host='0.0.0.0', port=5000, debug=True)
