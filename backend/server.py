import os
import paho.mqtt.client as paho
from dotenv import load_dotenv
import json
import time
from ollama import Client
from typing import Literal
from pydantic import BaseModel
from systemprompt import SYSTEM_PROMPT
from voice_protocol import parse_voice_request, build_voice_response

class Command(BaseModel):
    action: Literal[
        "FORWARD",
        "BACKWARD",
        "TURN_LEFT",
        "TURN_RIGHT",
        "STOP",
        "ATTACK",
        "DEFENSE",
    ]
    duration: int

class CommandBatch(BaseModel):
    commands: list[Command]

#load variable from .env
load_dotenv()

#read and assign .env to variable
hivemq_host = os.getenv("HIVEMQ_HOST", "broker.hivemq.com")
hivemq_port = int(os.getenv("HIVEMQ_PORT", "1883"))
hivemq_username = os.getenv("HIVEMQ_USERNAME")
hivemq_password = os.getenv("HIVEMQ_PASSWORD")

topic_voice = os.getenv("TOPIC_VOICE", "n8q4x2m7v9p3k6t1r5z0/voice_in")
topic_commands = os.getenv("TOPIC_COMMANDS", "n8q4x2m7v9p3k6t1r5z0/command_out")

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

if hivemq_port == 8883:
    client.tls_set()
if hivemq_username:
    client.username_pw_set(hivemq_username, hivemq_password)

#validate payload function
def validate_payload(payload):
    try:
        return parse_voice_request(payload, int(time.time() * 1000))
    except (ValueError, TypeError, UnicodeError) as error:
        print("Invalid voice request:", error)
        return

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
    if msg.retain or msg.topic != topic_voice:
        print("Retain message:", msg.retain)
        return
    print("Topic : " + msg.topic)
    request = validate_payload(msg.payload)
    if not request:
        return

    try:
        response = build_voice_response(request, message_to_command(request["text"]))
    except Exception as error:
        # Keep the MQTT worker alive if inference or output validation fails.
        print("Voice translation failed:", error)
        return
    client.publish(topic_commands, json.dumps(response), qos=0, retain=False)

if __name__ == "__main__":
    #connect client
    client.on_connect = on_connect
    client.on_message = on_message

    client.connect(hivemq_host, hivemq_port)
    client.loop_forever()
