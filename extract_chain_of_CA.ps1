$domain = "oauth2.googleapis.com" # Il dominio che ti dà errore
$outPath = "C:\Users\ldepinto\.claude\zscaler-fixed.pem"

# Apriamo una connessione SSL verso il dominio
$tcpClient = New-Object System.Net.Sockets.TcpClient($domain, 443)
$sslStream = New-Object System.Net.Security.SslStream($tcpClient.GetStream(), $false)
$sslStream.AuthenticateAsClient($domain)

# Estraiamo la catena dei certificati
$certChain = $sslStream.RemoteCertificate.Handle
$chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
$chain.Build($sslStream.RemoteCertificate)

# Cicliamo sui certificati della catena e salviamoli in formato PEM
$pemContent = foreach ($element in $chain.ChainElements) {
    $cert = $element.Certificate
    $base64 = [System.Convert]::ToBase64String($cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert), "InsertLineBreaks")
    "-----BEGIN CERTIFICATE-----`r`n$base64`r`n-----END CERTIFICATE-----"
}

$pemContent | Out-File -FilePath $outPath -Encoding ascii
$tcpClient.Close()

Write-Host "Catena di certificati salvata in: $outPath" -ForegroundColor Green
