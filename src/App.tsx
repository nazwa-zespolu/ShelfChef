/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import HomeView from './HomeView';
import ProductScannerView from './ProductScannerView';
import RecipeGeneratorView from './RecipeGeneratorView';
import ShoppingListView from './ShoppingListView';
import {setupDatabase} from './infrastructure/db/init';
import {initExecutorch} from 'react-native-executorch';
import {BareResourceFetcher} from 'react-native-executorch-bare-resource-fetcher';

type AppScreen = 'home' | 'scan' | 'recipes' | 'shopping';

try {
  initExecutorch({resourceFetcher: BareResourceFetcher});
} catch (e) {
  console.error('[ShelfChef] initExecutorch failed', e);
}

function App() {
  //const isDarkMode = useColorScheme() === 'dark';
  const [screen, setScreen] = useState<AppScreen>('home');
  const [inventoryTick, setInventoryTick] = useState(0);

  useEffect(() => {
    try {
      setupDatabase();
    } catch (e) {
      console.error('[ShelfChef] setupDatabase failed', e);
    }
  }, []);

  return (
    <SafeAreaProvider>
      {/* <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} /> */}
      <View style={styles.shell}>
        {screen === 'home' && (
          <HomeView
            refreshToken={inventoryTick}
            onOpenScan={() => setScreen('scan')}
            onOpenRecipes={() => setScreen('recipes')}
            onOpenShopping={() => setScreen('shopping')}
          />
        )}
        {screen === 'scan' && (
          <ProductScannerView
            onRequestClose={() => setScreen('home')}
            onProductAdded={() => setInventoryTick(tick => tick + 1)}
          />
        )}
        {screen === 'recipes' && (
          <RecipeGeneratorView onRequestClose={() => setScreen('home')} />
        )}
        {screen === 'shopping' && (
          <ShoppingListView onRequestClose={() => setScreen('home')} />
        )}
      </View>
    </SafeAreaProvider>
  );
}

export default App;

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
});
