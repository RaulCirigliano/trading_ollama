import json
import os
import re
import time
import threading
from datetime import datetime, timedelta
from pydantic import BaseModel
from typing import List, Optional

_LOCK = threading.RLock()

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUZON_FILE = os.path.join(PROJECT_ROOT, "buzon_radar.json")

_PROCESS_CLEANED_PATHS = set()

class OpportunityCard(BaseModel):
    id: str
    timestamp: str  # ISO format
    activo: str     # Ej: AAPL, BTC/USDT
    titular: str
    impacto: str    # "POSITIVO", "NEGATIVO", "NEUTRAL"
    confianza: int  # 0 a 100
    justificacion: str

class RadarInbox:
    def __init__(self, file_path: Optional[str] = None):
        self.file_path = file_path or BUZON_FILE
        self._insert_count = 0
        with _LOCK:
            self._ensure_file_exists()
            if self.file_path not in _PROCESS_CLEANED_PATHS:
                self.clear_expired_cards()
                _PROCESS_CLEANED_PATHS.add(self.file_path)

    def _ensure_file_exists(self):
        """Crea el archivo del buzón si no existe."""
        if not os.path.exists(self.file_path):
            self._atomic_write([])

    def _atomic_write(self, data: list):
        """Escritura atómica garantizada con flush, fsync y os.replace."""
        tmp_path = f"{self.file_path}.tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, self.file_path)

    def read_all_cards(self) -> List[OpportunityCard]:
        """Lee todas las tarjetas del archivo con recuperación ante corrupción."""
        with _LOCK:
            if not os.path.exists(self.file_path):
                return []
            try:
                with open(self.file_path, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if not content:
                        return []
                    data = json.loads(content)
                    if not isinstance(data, list):
                        raise ValueError("Contenido de buzón no es una lista")
                    valid_cards = []
                    for item in data:
                        try:
                            valid_cards.append(OpportunityCard(**item))
                        except Exception:
                            continue
                    return valid_cards
            except Exception as e:
                # Archivo corrupto o ilegible: renombrar a .corrupt-<timestamp> para preservar evidencia
                corrupt_path = f"{self.file_path}.corrupt-{int(time.time())}"
                try:
                    os.replace(self.file_path, corrupt_path)
                    print(f"⚠️ Buzón corrupto renombrado a {corrupt_path}: {e}")
                except Exception as r_err:
                    print(f"Error renombrando archivo corrupto: {r_err}")
                self._atomic_write([])
                return []

    def save_all_cards(self, cards: List[OpportunityCard]):
        """Sobrescribe el archivo de forma atómica con la lista de tarjetas."""
        with _LOCK:
            try:
                data = [card.model_dump() for card in cards]
                self._atomic_write(data)
            except Exception as e:
                print(f"Error guardando en el buzón: {e}")

    def _normalize_title(self, text: str) -> str:
        return re.sub(r'\s+', ' ', (text or '').lower().strip())

    def add_cards(self, new_cards: List[OpportunityCard]):
        """Agrega un lote de tarjetas con deduplicación por (activo, titular) en las últimas 6 horas."""
        if not new_cards:
            return
        with _LOCK:
            existing = self.read_all_cards()
            now = datetime.now()
            cutoff_6h = now - timedelta(hours=6)

            # Construir conjunto de deduplicación reciente (últimas 6h)
            recent_seen = set()
            for c in existing:
                try:
                    ts = datetime.fromisoformat(c.timestamp)
                    if ts >= cutoff_6h:
                        recent_seen.add((c.activo.upper().strip(), self._normalize_title(c.titular)))
                except Exception:
                    pass

            cards_to_append = []
            for c in new_cards:
                key = (c.activo.upper().strip(), self._normalize_title(c.titular))
                if key not in recent_seen:
                    recent_seen.add(key)
                    cards_to_append.append(c)

            if cards_to_append:
                existing.extend(cards_to_append)
                self.save_all_cards(existing)

            self._insert_count += len(cards_to_append)
            if self._insert_count >= 10:
                self.clear_expired_cards()
                self._insert_count = 0

    def add_card(self, card: OpportunityCard):
        """Envoltorio retrocompatible de add_cards para una sola tarjeta."""
        self.add_cards([card])

    def get_active_cards(self, hours_ttl: int = 72) -> List[OpportunityCard]:
        """Devuelve solo las tarjetas que no han superado el TTL, ignorando timestamps inválidos."""
        with _LOCK:
            cards = self.read_all_cards()
            active_cards = []
            now = datetime.now()
            ttl_delta = timedelta(hours=hours_ttl)

            for card in cards:
                try:
                    card_time = datetime.fromisoformat(card.timestamp)
                    if now - card_time <= ttl_delta:
                        active_cards.append(card)
                except Exception:
                    # Ignorar tarjetas con timestamp mal formado sin romper la ejecución
                    continue

            return active_cards

    def clear_expired_cards(self, hours_ttl: int = 72) -> int:
        """Limpia físicamente el archivo borrando las tarjetas vencidas."""
        with _LOCK:
            cards = self.read_all_cards()
            active_cards = self.get_active_cards(hours_ttl)
            if len(active_cards) != len(cards):
                self.save_all_cards(active_cards)
            return len(active_cards)
