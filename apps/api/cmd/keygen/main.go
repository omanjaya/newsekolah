// Command keygen generates an ES256 (P-256) private key and prints it as a
// base64-encoded PKCS#8 DER blob, suitable for the JWT_SIGNING_KEY env var.
package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/base64"
	"fmt"
	"os"
)

func main() {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		fmt.Fprintln(os.Stderr, "generate key:", err)
		os.Exit(1)
	}

	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		fmt.Fprintln(os.Stderr, "marshal key:", err)
		os.Exit(1)
	}

	fmt.Println(base64.StdEncoding.EncodeToString(der))
}
