/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {BackHandler, StyleSheet, View} from 'react-native';
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
  const [inventoryTick, setInventoryTick] = useState(0);

  useEffect(() => {
    try {
      setupDatabase();
    } catch (e) {
      console.error('[ShelfChef] setupDatabase failed', e);
    }
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeTab === 'pantry') {
        return false;
      }
      setActiveTab('pantry');
      return true;
    });
    return () => subscription.remove();
  }, [activeTab]);

  return (
    <SafeAreaProvider>
      {/* <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} /> */}
      <View style={styles.shell}>
        <View style={styles.content}>
          {activeTab === 'pantry' ? <HomeView refreshToken={inventoryTick} /> : null}
          {activeTab === 'scan' ? (
            <ProductScannerView onProductAdded={() => setInventoryTick(tick => tick + 1)} />
          ) : null}
          {activeTab === 'recipes' ? <RecipeGeneratorView /> : null}
          {activeTab === 'shopping' ? (
            <ShoppingListView
              onRequestClose={() => setActiveTab('pantry')}
              onInventoryChanged={() => setInventoryTick(tick => tick + 1)}
            />
          ) : null}
        </View>
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
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
});
