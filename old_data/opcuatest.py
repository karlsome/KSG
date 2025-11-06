from opcua import Client

# Change IP to your PLC’s IP
client = Client("opc.tcp://192.168.0.100:4840")

try:
    client.connect()
    print("✅ Connected to KV-8000")

    # Browse the address space root
    root = client.get_root_node()
    print("Root node is:", root)
    print("\nChildren of root:")
    for child in root.get_children():
        print(" ", child, "-", child.get_browse_name())
    
    # Browse to GlobalVars where your variables should be
    print("\n🔍 Browsing into GlobalVars...")
    globalvars_node = client.get_node("ns=4;i=1014")
    print("GlobalVars node:", globalvars_node)
    
    print("\nVariables in GlobalVars:")
    for var in globalvars_node.get_children():
        try:
            browse_name = var.get_browse_name()
            print(f"  {var} - {browse_name}")
            
            # Try to read the value
            try:
                value = var.get_value()
                print(f"    Value: {value}")
            except:
                print(f"    (Cannot read value)")
                
        except Exception as e:
            print(f"    Error: {e}")
    
    # Try to find W312_2_Kadou1 specifically
    print("\n🔎 Searching for W312_2_Kadou1...")
    try:
        # Try different namespace/node ID combinations
        for ns in [2, 3, 4]:
            try:
                node = client.get_node(f"ns={ns};s=W312_2_Kadou1")
                val = node.get_value()
                print(f"✅ Found at ns={ns};s=W312_2_Kadou1 = {val}")
                break
            except:
                print(f"   Not found in namespace {ns}")
    except Exception as e:
        print(f"❌ Could not find W312_2_Kadou1: {e}")

finally:
    client.disconnect()
    print("🔌 Disconnected")