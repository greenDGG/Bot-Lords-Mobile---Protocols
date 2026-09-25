from mitmproxy import http, tcp, ctx
import json
import time
import asyncio


TARGET = "https://cgi-dsa.iggapis.com/client/access_token/platform"

access_token = None
platform_response = None
matched = False


async def shutdown():
    await asyncio.sleep(0.5)
    ctx.master.shutdown()


class Capturer:

    def response(self, flow: http.HTTPFlow):
        global access_token, platform_response

        if flow.request.pretty_url == TARGET:

            body = flow.response.content.decode(errors="ignore")
            print("\n=== PLATFORM RESPONSE ===")
            print(body)

            try:
                platform_response = json.loads(body)
                iggid = platform_response.get("data", {}).get("iggid")

                access_token = (
                    platform_response
                    .get("data", {})
                    .get("access_token")
                )

                if access_token:
                    print("\n=== ACCESS TOKEN CAPTURADO ===")
                    print(access_token)

            except Exception as e:
                print("Error parseando JSON:", e)


    def tcp_message(self, flow: tcp.TCPFlow):
        global matched

        if matched:
            return

        if access_token is None:
            return

        message = flow.messages[-1]
        data = message.content

        if access_token.encode() in data:

            matched = True

            server_ip = flow.server_conn.address[0]
            server_port = flow.server_conn.address[1]
            trace_id = platform_response.get("trace_id", "") if platform_response else ""

            # Build result in bot's token.json format
            result = {
                "trace_id": trace_id,
                "proxy": f"{server_ip}:{server_port}",
                "error": platform_response.get("error", {}),
                "data": platform_response.get("data", {}),
                "setting": {
                    "shieldAutomated": True,
                    "sendHelp": True
                }
            }

            # Determine filename: use iggid if available
            iggid = platform_response.get("data", {}).get("iggid", "unknown")
            filename = f"capture_{iggid}.json"

            with open(filename, "w", encoding="utf-8") as f:
                json.dump(result, f, indent=4, ensure_ascii=False)

            print(f"\n=== CAPTURADO {filename} ===")
            print(f"IGG ID: {iggid}")
            print(f"Proxy: {server_ip}:{server_port}")
            print(f"Access Token: {access_token[:40]}...")

            asyncio.create_task(shutdown())


addons = [
    Capturer()
]
