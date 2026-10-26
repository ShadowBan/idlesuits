import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import './lib/cardStyle.svelte';

export default mount(App, { target: document.getElementById('app')! });
