from flask import Flask, jsonify

app = Flask(__name__)

@app.route("/")
def home():
    return "App rodando 🚀"

@app.route("/health")
def health():
    return jsonify({"status": "ok"})