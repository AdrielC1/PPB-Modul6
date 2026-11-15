import { useCallback, useEffect, useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import Ionicons from "@expo/vector-icons/Ionicons";
import { enableScreens } from "react-native-screens";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MonitoringScreen } from "./src/screens/MonitoringScreen.js";
import { ControlScreen } from "./src/screens/ControlScreen.js";
import { LiveTempSplash } from "./src/components/LiveTempSplash.js";
import { assertConfig } from "./src/services/config.js";
import { tokens } from "./src/theme/tokens.js";

const Tab = createBottomTabNavigator();
const { color } = tokens;

enableScreens(true);

export default function App() {
  const [splashDone, setSplashDone] = useState(false);
  const [sweepStarted, setSweepStarted] = useState(false);

  const handleSweepStart = useCallback(() => {
    setSweepStarted(true);
  }, []);

  const handleSplashFinish = useCallback(() => {
    setSplashDone(true);
  }, []);

  useEffect(() => {
    assertConfig();
  }, []);

  const theme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: color.bg,
      card: color.surface,
      text: color.text,
      border: color.border,
      primary: color.primary,
    },
  };

  return (
    <View style={{ flex: 1, backgroundColor: splashDone ? color.bg : "#F8FAFC" }} collapsable={false}>
      <SafeAreaProvider>
        <NavigationContainer theme={theme}>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: true,
            headerTitle: "LiveTemp",
            headerTitleAlign: "left",
            headerTintColor: color.text,
            headerStyle: {
              backgroundColor: color.surface,
              borderBottomWidth: 1,
              borderBottomColor: color.border,
            },
            headerTitleStyle: {
              fontWeight: "600",
              fontSize: 17,
              // ponytail: system monospace, no custom font dep
              fontFamily: "monospace",
              letterSpacing: -0.5,
            },
            tabBarActiveTintColor: color.primary,
            tabBarInactiveTintColor: color.text2,
            tabBarLabelStyle: { fontSize: 12, fontWeight: "500" },
            tabBarStyle: {
              backgroundColor: color.surface,
              borderTopWidth: 1,
              borderTopColor: color.border,
            },
            tabBarHideOnKeyboard: true,
            tabBarIcon: ({ color: iconColor }) => {
              const iconName = route.name === "Monitoring" ? "pulse" : "options";
              return <Ionicons name={iconName} size={24} color={iconColor} />;
            },
          })}
        >
          <Tab.Screen name="Monitoring" component={MonitoringScreen} />
          <Tab.Screen name="Control" component={ControlScreen} />
        </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
      {!splashDone && !sweepStarted ? (
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: "#F8FAFC", zIndex: 999, elevation: 999 }]}
          pointerEvents="none"
        />
      ) : null}
      <Modal
        visible={!splashDone}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        hardwareAccelerated
        animationType="none"
        onRequestClose={() => {}}
      >
        <LiveTempSplash
          onSweepStart={handleSweepStart}
          onFinish={handleSplashFinish}
        />
      </Modal>
    </View>
  );
}
