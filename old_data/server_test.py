from opcua import Server
import datetime
import time

server = Server()
server.set_endpoint("opc.tcp://0.0.0.0:4840/freeopcua/server/")
server.set_server_name("MyTestOPCUAServer")
uri = "http://example.org"
idx = server.register_namespace(uri)

objects = server.get_objects_node()
myobj = objects.add_object(idx, "MyDevice")

temp = myobj.add_variable(idx, "Temperature", 25.0)
pressure = myobj.add_variable(idx, "Pressure", 1.02)
temp.set_writable()
pressure.set_writable()

server.start()
print("OPC UA Server started at opc.tcp://localhost:4840/freeopcua/server/")
print("Press Ctrl+C to stop...")

try:
    while True:
        temp.set_value(temp.get_value() + 0.1)
        pressure.set_value(pressure.get_value() + 0.01)
        time.sleep(1)  # small delay to simulate updates
except KeyboardInterrupt:
    print("Stopping server...")
    server.stop()