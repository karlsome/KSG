from opcua import Client

url = "opc.tcp://127.0.0.1:4840/freeopcua/server/"
client = Client(url)

try:
    client.connect()
    print("Connected to OPC UA server")

    root = client.get_root_node()
    print("Root node is:", root)

    objects = client.get_objects_node()
    print("Objects node is:", objects)

    # Example: list variables
    for child in objects.get_children():
        print("Child:", child)
finally:
    client.disconnect()