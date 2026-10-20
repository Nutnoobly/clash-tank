import os
import paho.mqtt.client as paho
from dotenv import load_dotenv
import json
import time
from ollama import chat, Client
from typing import Literal
from pydantic import BaseModel
from systemprompt import SYSTEM_PROMPT

class Command(BaseModel):
    action: Literal[
        "FORWARD",
        "BACKWARD",
        "TURN_LEFT",
        "TURN_RIGHT",
        "STOP",
        "ATTACK",
        "DEFENSE",
        "SPIN",
    ]
    duration: int

class CommandBatch(BaseModel):
    commands: list[Command]

#load variable from .env
load_dotenv()

#read and assign .env to variable
hivemq_host = os.getenv("HIVEMQ_HOST")
hivemq_port = int(os.getenv("HIVEMQ_PORT", "8883"))
hivemq_username = os.getenv("HIVEMQ_USERNAME")
hivemq_password = os.getenv("HIVEMQ_PASSWORD")

topic_voice = os.getenv("TOPIC_VOICE")
topic_commands = os.getenv("TOPIC_COMMANDS")

ollama_host = os.getenv("OLLAMA_HOST")
ollama_model = os.getenv("OLLAMA_MODEL")
ollama_client = Client(host=ollama_host)

#client configure
client = paho.Client(
    callback_api_version=paho.CallbackAPIVersion.VERSION2,
    client_id="clash-tank-server",
    userdata=None,
    protocol=paho.MQTTv5,
)

client.tls_set()
client.username_pw_set(hivemq_username, hivemq_password)

#validate payload function
def validate_payload(payload):
    try:
        json_payload = json.loads(payload)
        print ("Json is valid\n")
    except ValueError as e:
        print ("Json is not valid")
        return

    timestamp = json_payload.get("timestamp", 0)
    confidence = json_payload.get("confidence", 1.0)

    if (confidence < 0.5) :
        print("Confidence level too low :", confidence)
        return

    now_ms = int(time.time() * 1000)
    age_ms = now_ms - timestamp
    # if age_ms > 5000:
    #     print("Message time out:", age_ms, "ms")
    #     return

    text = json_payload.get("text", "").strip()
    if not text:
        print("Empty text")
        return

    print("Validation pass!\n")
    return text

#translate message to command using llm
def message_to_command(message):
    response = ollama_client.chat(
        model=ollama_model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": message},
        ],
        format=CommandBatch.model_json_schema(),
    )
    return response.message.content

#connect and chekc connection function
def on_connect(client, userdata, flags, reason_code, properties) :
    if (reason_code.is_failure):
        print(reason_code)
        return
    client.subscribe(topic_voice)
    print("Client connected!")

#read message functionprint("Retain message:", msg.retain)
def on_message(client, userdata, msg):
    if (msg.retain):
        print("Retain message:", msg.retain)
        return
    print("Topic : " + msg.topic)
    print("Payload:", msg.payload.decode("utf-8"))

    text = validate_payload(msg.payload)
    if not text:
        return

    command_json = message_to_command(text)
    print("Command JSON:", command_json)

    if not json.loads(command_json).get("commands"):
        print("No valid commands, skipping publish")
        return

    client.publish(topic_commands, command_json)

if __name__ == "__main__":
    #connect client
    client.on_connect = on_connect
    client.on_message = on_message

    client.connect(hivemq_host, hivemq_port)
    client.loop_forever()
