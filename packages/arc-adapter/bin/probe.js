#!/usr/bin/env node
import { runProbe } from '../dist/probe-cli.js';

const code = await runProbe(process.env);
process.exit(code);
