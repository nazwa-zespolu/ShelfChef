/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {StatusBar, useColorScheme, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import HomeView from './HomeView';
import ProductScannerView from './ProductScannerView';
import RecipeGeneratorView from './RecipeGeneratorView';
import ShoppingListView from './ShoppingListView';
import {setupDatabase} from './infrastructure/db/init';

type AppScreen = 'home' | 'scan' | 'recipes' | 'shopping';

function App() {
  //const isDarkMode = useColorScheme() === 'dark';
  const [screen, setScreen] = useState<AppScreen>('home');

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
      <View style={{flex: 1}}>
        {screen === 'home' && (
          <HomeView
            onOpenScan={() => setScreen('scan')}
            onOpenRecipes={() => setScreen('recipes')}
            onOpenShopping={() => setScreen('shopping')}
          />
        )}
        {screen === 'scan' && (
          <ProductScannerView onRequestClose={() => setScreen('home')} />
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
