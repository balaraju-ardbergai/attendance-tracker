if (!process.geteuid) {
  process.geteuid = () => 0;
}
