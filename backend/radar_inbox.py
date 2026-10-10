import json
import os
from datetime import datetime, timedelta
from pydantic import BaseModel
from typing import List, Optional

BUZON_FILE = "buzon_radar.json"

class OpportunityCard(BaseModel):
    id: str
    timestamp: str  # ISO format
    activo: str     # Ej: AAPL, BTC/USDT
    titular: str
    impacto: str    # "POSITIVO", "NEGATIVO", "NEUTRAL"
    confianza: int  # 0 a 100
    justificacion: str

class RadarInbox:
    def __init__(self, file_path=BUZON_FILE):
        self.file_path = file_path
        self._ensure_file_exists()

    def _ensure_file_exists(self):
        """Crea el archivo del buzón si no existe."""
        if not os.path.exists(self.file_path):
            with open(self.file_path, "w", encoding="utf-8") as f:
                json.dump([], f)

    def read_all_cards(self) -> List[OpportunityCard]:
        """Lee todas las tarjetas del archivo."""
        try:
            with open(self.file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return [OpportunityCard(**item) for item in data]
        except Exception as e:
            print(f"Error leyendo el buzón: {e}")
            return []

    def save_all_cards(self, cards: List[OpportunityCard]):
        """Sobrescribe el archivo con la lista de tarjetas actualizadas."""
        try:
            with open(self.file_path, "w", encoding="utf-8") as f:
                json.dump([card.model_dump() for card in cards], f, indent=4, ensure_ascii=False)
        except Exception as e:
            print(f"Error guardando en el buzón: {e}")

    def add_card(self, card: OpportunityCard):
        """Agrega una nueva tarjeta al buzón."""
        cards = self.read_all_cards()
        cards.append(card)
        self.save_all_cards(cards)

    def get_active_cards(self, hours_ttl=72) -> List[OpportunityCard]:
        """Devuelve solo las tarjetas que no han superado el TTL (Time-To-Live)."""
        cards = self.read_all_cards()
        active_cards = []
        now = datetime.now()
        
        for card in cards:
            card_time = datetime.fromisoformat(card.timestamp)
            if now - card_time <= timedelta(hours=hours_ttl):
                active_cards.append(card)
        
        return active_cards

    def clear_expired_cards(self, hours_ttl=72):
        """Limpia físicamente el archivo borrando las tarjetas vencidas."""
        active_cards = self.get_active_cards(hours_ttl)
        self.save_all_cards(active_cards)
        return len(active_cards)

# Pruebas rápidas si se ejecuta este archivo directamente
if __name__ == "__main__":
    import uuid
    
    inbox = RadarInbox()
    print("Estado inicial del buzón:", len(inbox.read_all_cards()), "tarjetas.")
    
    # Simulamos que el Radar encontró una noticia durante el fin de semana
    nueva_tarjeta = OpportunityCard(
        id=str(uuid.uuid4()),
        timestamp=datetime.now().isoformat(),
        activo="AAPL",
        titular="Apple anuncia un aumento de producción sorpresa de iPhone 16",
        impacto="POSITIVO",
        confianza=85,
        justificacion="Los proveedores en Asia reportan un 20% más de pedidos de componentes clave."
    )
    
    inbox.add_card(nueva_tarjeta)
    print("Tarjeta agregada. Tarjetas activas (últimas 72hs):", len(inbox.get_active_cards()))
