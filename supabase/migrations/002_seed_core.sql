insert into public.tickers(symbol, company, sector, is_default, priority) values
('AAPL','Apple Inc.','Technology',true,1),('NVDA','NVIDIA Corp.','Technology',true,2),('TSLA','Tesla Inc.','Consumer Cyclical',true,3),
('MSFT','Microsoft Corp.','Technology',true,4),('AMZN','Amazon.com Inc.','Consumer Cyclical',true,5),('META','Meta Platforms Inc.','Technology',true,6),
('GOOGL','Alphabet Inc.','Technology',true,7),('AMD','Advanced Micro Devices Inc.','Technology',true,8),('NFLX','Netflix Inc.','Communication Services',true,9),
('COIN','Coinbase Global Inc.','Financial Services',true,10),('PLTR','Palantir Technologies Inc.','Technology',true,11),('SPY','SPDR S&P 500 ETF Trust','ETF',true,12),
('QQQ','Invesco QQQ Trust','ETF',true,13),('IWM','iShares Russell 2000 ETF','ETF',true,14)
on conflict(symbol) do update set company=excluded.company, sector=excluded.sector, is_default=excluded.is_default, priority=excluded.priority;

insert into public.provider_configs(provider_key,interface_name,display_name,adapter,mode,supplies,candidate_providers,notes) values
('market','MarketDataProvider','Market data','IndependentDemoProvider','demo','["quotes","bars","market snapshot"]','["Polygon","Twelve Data","Alpaca","Tradier"]','No vendor is connected yet. Add credentials only for providers you choose.'),
('options','OptionsDataProvider','Options data','IndependentDemoProvider','demo','["chains","greeks","IV"]','["Tradier","Polygon","ThetaData"]','Ready for a real adapter; no SuperCool dependency.'),
('news','NewsProvider','News & catalysts','IndependentDemoProvider','demo','["news","filings","transcripts"]','["Benzinga","Finnhub","SEC EDGAR"]','Independent provider slot.'),
('macro','MacroProvider','Macro calendar','IndependentDemoProvider','demo','["economic events","rates"]','["FRED","Trading Economics"]','Independent provider slot.'),
('sentiment','SentimentProvider','Sentiment','IndependentDemoProvider','demo','["retail","professional"]','["StockTwits","custom"]','Independent provider slot.'),
('earnings','EarningsProvider','Earnings calendar','IndependentDemoProvider','demo','["earnings events"]','["Finnhub","Polygon"]','Independent provider slot.'),
('ai','AnalystProvider','Grounded analyst','IndependentStoredData','connected','["stored database context"]','["OpenAI","local model"]','Default function is deterministic and grounded; optional LLM can be added later.')
on conflict(provider_key) do update set interface_name=excluded.interface_name,display_name=excluded.display_name,adapter=excluded.adapter,mode=excluded.mode,supplies=excluded.supplies,candidate_providers=excluded.candidate_providers,notes=excluded.notes;
