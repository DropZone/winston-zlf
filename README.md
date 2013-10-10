ZLF add-on for winston
======================

config file for winston transport

```javascript
{
	level: 'info',
	host: '127.0.0.1',
	port: 7897,
	compressionMode: 'uncompressed',
	facility: 'ProjectX.Development', //Default facility for log4j xml layout
	realm: 'ProjectX',
	subrealm: 'Development',
	udpType: 'udp4', // udp4(IPv4) || udp6(IPv6)
	maxBodyLength: 100,	//max body length per chunk
}
```