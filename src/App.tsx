/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {ActivityIndicator, BackHandler, Button, StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import HomeView from './HomeView';
import ProductScannerView from './ProductScannerView';
import RecipeGeneratorView from './RecipeGeneratorView';
import ShoppingListView from './ShoppingListView';
import {setupDatabase} from './infrastructure/db/init';
import {initExecutorch} from 'react-native-executorch';
import {BareResourceFetcher} from 'react-native-executorch-bare-resource-fetcher';
import BottomNav, {AppTab} from './components/BottomNav';
import {colors} from './theme/colors';

try {
  initExecutorch({resourceFetcher: BareResourceFetcher});
} catch (e) {
  console.error('[ShelfChef] initExecutorch failed', e);
}

function App() {
  //const isDarkMode = useColorScheme() === 'dark';
  const [activeTab, setActiveTab] = useState<AppTab>('pantry');
  const [bottomNavVisible, setBottomNavVisible] = useState(true);
  const [inventoryTick, setInventoryTick] = useState(0);
  const [inventorySwipeHintPending, setInventorySwipeHintPending] = useState(false);
  const [inventoryItemCount, setInventoryItemCount] = useState<number | null>(null);
  const [databaseState, setDatabaseState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [databaseAttempt, setDatabaseAttempt] = useState(0);

  useEffect(() => {
    try {
      setupDatabase();
      setDatabaseState('ready');
    } catch (e) {
      console.error('[ShelfChef] setupDatabase failed', e);
      setDatabaseState('error');
    }
  }, [databaseAttempt]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeTab === 'pantry') {
        return false;
      }
      setBottomNavVisible(true);
      setActiveTab('pantry');
      return true;
    });
    return () => subscription.remove();
  }, [activeTab]);

  if (databaseState !== 'ready') {
    return (
      <SafeAreaProvider>
        <View style={[styles.shell, styles.databaseStatus]}>
          {databaseState === 'loading' ? (
            <>
              <ActivityIndicator color={colors.success} />
              <Text style={styles.databaseStatusText}>Przygotowuję dane aplikacji…</Text>
            </>
          ) : (
            <>
              <Text style={styles.databaseStatusText}>Nie udało się otworzyć danych aplikacji.</Text>
              <Button
                title="Spróbuj ponownie"
                color={colors.success}
                onPress={() => {
                  setDatabaseState('loading');
                  setDatabaseAttempt(attempt => attempt + 1);
                }}
              />
            </>
          )}
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      {/* <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} /> */}
      <View style={styles.shell}>
        <View style={styles.content}>
          {activeTab === 'pantry' ? (
            <HomeView
              refreshToken={inventoryTick}
              shouldPlaySwipeHint={inventorySwipeHintPending}
              onInventoryCountChanged={setInventoryItemCount}
              onSwipeHintPlayed={() => {
                setInventorySwipeHintPending(false);
              }}
            />
          ) : null}
          {activeTab === 'scan' ? (
            <ProductScannerView
              onProductAdded={() => {
                setInventoryTick(tick => tick + 1);
                if (inventoryItemCount === 0) {
                  setInventorySwipeHintPending(true);
                }
              }}
            />
          ) : null}
          <View
            style={[styles.tabPanel, activeTab !== 'recipes' && styles.tabPanelHidden]}
            pointerEvents={activeTab === 'recipes' ? 'auto' : 'none'}>
            <RecipeGeneratorView />
          </View>
          {activeTab === 'shopping' ? (
            <ShoppingListView
              onRequestClose={() => {
                setBottomNavVisible(true);
                setActiveTab('pantry');
              }}
              onInventoryChanged={() => setInventoryTick(tick => tick + 1)}
              setBottomNavVisible={setBottomNavVisible}
            />
          ) : null}
        </View>
        {bottomNavVisible ? (
          <BottomNav
            activeTab={activeTab}
            onTabChange={tab => {
              if (tab !== 'shopping') {
                setBottomNavVisible(true);
              }
              setActiveTab(tab);
            }}
          />
        ) : null}
      </View>
    </SafeAreaProvider>
  );
}

export default App;

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  databaseStatus: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  databaseStatusText: {
    color: colors.textPrimary,
    textAlign: 'center',
  },
  tabPanel: {
    flex: 1,
  },
  tabPanelHidden: {
    display: 'none',
  },
});
